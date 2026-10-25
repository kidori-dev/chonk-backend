// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DepositWallet} from "./DepositWallet.sol";

/**
 * @title SweepFactory
 * @notice 유저별 입금 주소(DepositWallet Clone)를 CREATE2 로 만들고, 입금된 돈을 treasury 로 모은다.
 *
 * 흐름
 * 1. 서버가 유저마다 salt 를 정하고 predictAddress(salt) 로 입금 주소를 계산해 알려준다 (가스비 없음)
 * 2. 유저는 그 주소로 입금한다. 아직 컨트랙트가 없어도 받을 수 있다
 * 3. owner 가 sweep(salts, tokens) 를 호출하면, 필요한 Clone 을 그때 배포하고 잔액을 treasury 로 보낸다
 *
 * - Clone(EIP-1167)은 원본(implementation)에 호출을 위임하는 아주 작은 컨트랙트라 배포비가 싸다.
 * - CREATE2 라서 같은 salt 면 언제 배포해도 같은 주소가 나온다.
 * - treasury 는 owner 만 바꿀 수 있다. owner 키가 곧 자금 통제권이니 안전하게 보관한다.
 */
contract SweepFactory is Ownable2Step {
    /// @notice 모든 입금 주소가 로직을 빌려 쓰는 DepositWallet 원본
    address public immutable implementation;

    /// @notice sweep 한 돈이 모이는 주소
    address public treasury;

    /// @notice tokens 배열에서 ETH 를 뜻하는 값
    address public constant NATIVE = address(0);

    event WalletDeployed(bytes32 indexed salt, address indexed wallet);
    event Swept(address indexed wallet, address indexed token, address indexed to, uint256 amount);
    event TreasuryChanged(address indexed previousTreasury, address indexed newTreasury);

    error ZeroAddress();

    constructor(address owner_, address treasury_) Ownable(owner_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        implementation = address(new DepositWallet());
        treasury = treasury_;
        emit TreasuryChanged(address(0), treasury_);
    }

    /// @notice salt 에 해당하는 입금 주소. 배포 전이어도 계산된다
    function predictAddress(bytes32 salt) public view returns (address) {
        return Clones.predictDeterministicAddress(implementation, salt, address(this));
    }

    /// @notice salt 의 입금 주소에 컨트랙트가 배포되어 있는지
    function isDeployed(bytes32 salt) public view returns (bool) {
        return predictAddress(salt).code.length > 0;
    }

    /// @notice salt 의 입금 주소에 DepositWallet Clone 을 배포한다
    function deployWallet(bytes32 salt) public onlyOwner returns (address wallet) {
        wallet = Clones.cloneDeterministic(implementation, salt);
        emit WalletDeployed(salt, wallet);
    }

    /**
     * @notice 여러 입금 주소의 잔액을 treasury 로 모은다. 아직 배포 안 된 주소는 먼저 배포한다
     * @param salts 모을 입금 주소들의 salt
     * @param tokens 모을 자산 목록. ETH 는 NATIVE(address(0))
     */
    function sweep(bytes32[] calldata salts, address[] calldata tokens) external onlyOwner {
        address to = treasury;
        for (uint256 i = 0; i < salts.length; i++) {
            address wallet = predictAddress(salts[i]);
            if (wallet.code.length == 0) {
                deployWallet(salts[i]);
            }

            for (uint256 j = 0; j < tokens.length; j++) {
                uint256 amount = tokens[j] == NATIVE
                    ? DepositWallet(payable(wallet)).sweepNative(payable(to))
                    : DepositWallet(payable(wallet)).sweepToken(IERC20(tokens[j]), to);
                if (amount > 0) {
                    emit Swept(wallet, tokens[j], to, amount);
                }
            }
        }
    }

    /// @notice 돈이 모일 주소를 바꾼다
    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, newTreasury);
        treasury = newTreasury;
    }
}

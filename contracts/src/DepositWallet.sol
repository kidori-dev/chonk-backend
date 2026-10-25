// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DepositWallet
 * @notice 유저 한 명의 입금 주소. SweepFactory 가 이 컨트랙트의 Clone(EIP-1167)을 CREATE2 로 만든다.
 *
 * - 이 컨트랙트 자체(원본, implementation)는 직접 쓰지 않는다. 로직만 빌려주고 Clone 들이 호출을 위임한다.
 * - 각 Clone 은 자기 잔액만 가진다. 돈을 옮길 수 있는 건 자기를 만든 SweepFactory 뿐이다.
 * - Clone 이 배포되기 전에도 주소는 미리 계산되므로, 그 주소로 먼저 입금받아도 된다.
 * - factory 는 immutable 이라 원본 바이트코드에 박힌다. Clone 은 원본 코드를 빌려 실행하므로 같은 값을 읽고,
 *   storage 에 쓰는 초기화(initialize)가 없어 Clone 배포비가 싸다.
 *   SweepFactory 는 자기 원본을 따로 배포하므로 factory 가 여러 개여도 각자의 Clone 만 움직일 수 있다.
 */
contract DepositWallet {
    using SafeERC20 for IERC20;

    /// @notice 이 지갑을 만든 SweepFactory. 이 주소만 sweep 을 호출할 수 있다
    address public immutable factory;

    error OnlyFactory();
    error NativeTransferFailed();

    modifier onlyFactory() {
        if (msg.sender != factory) revert OnlyFactory();
        _;
    }

    /// @dev 원본은 SweepFactory 생성자에서 배포되므로 msg.sender 가 곧 factory 다
    constructor() {
        factory = msg.sender;
    }

    /// @notice Clone 이 배포된 뒤에도 ETH 를 받을 수 있게 한다
    receive() external payable {}

    /// @notice ERC20 잔액 전부를 to 로 보낸다. 보낸 수량을 돌려준다
    function sweepToken(IERC20 token, address to) external onlyFactory returns (uint256 amount) {
        amount = token.balanceOf(address(this));
        if (amount > 0) {
            token.safeTransfer(to, amount);
        }
    }

    /// @notice ETH 잔액 전부를 to 로 보낸다. 보낸 수량을 돌려준다
    function sweepNative(address payable to) external onlyFactory returns (uint256 amount) {
        amount = address(this).balance;
        if (amount > 0) {
            (bool ok,) = to.call{value: amount}("");
            if (!ok) revert NativeTransferFailed();
        }
    }
}

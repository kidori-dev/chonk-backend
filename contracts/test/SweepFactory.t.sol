// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {DepositWallet} from "../src/DepositWallet.sol";
import {SweepFactory} from "../src/SweepFactory.sol";

contract MockToken is ERC20 {
    constructor() ERC20("Mock USDT", "mUSDT") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract SweepFactoryTest is Test {
    SweepFactory factory;
    MockToken token;

    address owner = makeAddr("owner");
    address treasury = makeAddr("treasury");
    address stranger = makeAddr("stranger");
    bytes32 salt = keccak256("user-1");

    address[] tokens;
    bytes32[] salts;

    function setUp() public {
        factory = new SweepFactory(owner, treasury);
        token = new MockToken();
        tokens = [address(token), factory.NATIVE()];
        salts = [salt];
    }

    /// predictAddress 로 계산한 주소에 그대로 배포된다
    function test_DeployToPredictedAddress() public {
        address predicted = factory.predictAddress(salt);
        assertFalse(factory.isDeployed(salt));

        vm.prank(owner);
        address wallet = factory.deployWallet(salt);

        assertEq(wallet, predicted);
        assertTrue(factory.isDeployed(salt));
        assertEq(DepositWallet(payable(wallet)).factory(), address(factory));
    }

    /// 배포 전에 입금된 돈도 sweep 된다 (sweep 이 Clone 을 먼저 배포)
    function test_SweepBeforeDeploy() public {
        address wallet = factory.predictAddress(salt);
        token.mint(wallet, 100e6);
        vm.deal(wallet, 1 ether);

        vm.prank(owner);
        factory.sweep(salts, tokens);

        assertEq(token.balanceOf(treasury), 100e6);
        assertEq(treasury.balance, 1 ether);
        assertEq(token.balanceOf(wallet), 0);
        assertEq(wallet.balance, 0);
        assertTrue(factory.isDeployed(salt));
    }

    /// 배포된 뒤에 들어온 돈도 sweep 된다
    function test_SweepAfterDeploy() public {
        vm.prank(owner);
        address wallet = factory.deployWallet(salt);

        token.mint(wallet, 50e6);
        (bool ok,) = wallet.call{value: 0.5 ether}("");
        assertTrue(ok);

        vm.prank(owner);
        factory.sweep(salts, tokens);

        assertEq(token.balanceOf(treasury), 50e6);
        assertEq(treasury.balance, 0.5 ether);
    }

    /// 잔액이 없어도 실패하지 않는다
    function test_SweepEmptyWallet() public {
        vm.prank(owner);
        factory.sweep(salts, tokens);
        assertTrue(factory.isDeployed(salt));
    }

    /// owner 가 아니면 sweep 과 배포를 못 한다
    function test_OnlyOwnerCanSweepAndDeploy() public {
        vm.startPrank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.sweep(salts, tokens);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.deployWallet(salt);
        vm.stopPrank();
    }

    /// 입금 지갑은 factory 만 호출할 수 있다
    function test_OnlyFactoryCanCallWallet() public {
        vm.prank(owner);
        address wallet = factory.deployWallet(salt);

        vm.prank(stranger);
        vm.expectRevert(DepositWallet.OnlyFactory.selector);
        DepositWallet(payable(wallet)).sweepToken(IERC20(address(token)), stranger);
    }

    /// 입금 지갑과 원본(implementation)은 다시 초기화할 수 없다
    function test_CannotReinitialize() public {
        vm.prank(owner);
        address wallet = factory.deployWallet(salt);
        // expectRevert 는 바로 다음 외부 호출에 걸리므로, implementation() 조회를 미리 해둔다
        address implementation = factory.implementation();

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        DepositWallet(payable(wallet)).initialize(stranger);

        vm.expectRevert(Initializable.InvalidInitialization.selector);
        DepositWallet(payable(implementation)).initialize(stranger);
    }

    /// 같은 salt 로 두 번 배포할 수 없다
    function test_CannotDeploySameSaltTwice() public {
        vm.startPrank(owner);
        factory.deployWallet(salt);
        vm.expectRevert();
        factory.deployWallet(salt);
        vm.stopPrank();
    }

    /// treasury 는 owner 만 바꿀 수 있고 0 주소는 안 된다
    function test_SetTreasury() public {
        address newTreasury = makeAddr("newTreasury");

        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger));
        factory.setTreasury(newTreasury);

        vm.prank(owner);
        vm.expectRevert(SweepFactory.ZeroAddress.selector);
        factory.setTreasury(address(0));

        vm.prank(owner);
        factory.setTreasury(newTreasury);
        assertEq(factory.treasury(), newTreasury);
    }
}

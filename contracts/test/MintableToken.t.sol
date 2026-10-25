// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Test} from "forge-std/Test.sol";

import {MintableToken} from "../src/MintableToken.sol";

contract MintableTokenTest is Test {
    MintableToken token;
    address owner = makeAddr("deployer");
    address user = makeAddr("user");

    function setUp() public {
        token = new MintableToken("Chonk Test USD", "CUSD", 6, owner);
    }

    function test_decimals() public view {
        assertEq(token.decimals(), 6);
        assertEq(token.symbol(), "CUSD");
    }

    function test_ownerCanMint() public {
        vm.prank(owner);
        token.mint(user, 100e6);
        assertEq(token.balanceOf(user), 100e6);
        assertEq(token.totalSupply(), 100e6);
    }

    function test_othersCannotMint() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        token.mint(user, 1);
    }
}

// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MintableToken
 * @notice 테스트용 ERC-20. owner(배포 계정) 가 원하는 주소로 원하는 만큼 찍어낼 수 있다.
 * 서버의 erc20-mint 커맨드가 배포하고 mint 한다. 입금 감지 / sweep 테스트용이라 실제 가치는 없다.
 */
contract MintableToken is ERC20, Ownable {
    uint8 private immutable DECIMALS;

    constructor(string memory name_, string memory symbol_, uint8 decimals_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        DECIMALS = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return DECIMALS;
    }

    /// @notice to 에게 amount(최소 단위) 만큼 새로 찍어준다. owner 만 호출할 수 있다
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}

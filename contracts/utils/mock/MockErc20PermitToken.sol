// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/extensions/draft-ERC20Permit.sol";

contract MockErc20PermitToken is ERC20Permit {
    constructor() ERC20("Token", "TKN") ERC20Permit("Token") {
        _mint(msg.sender, 1e6 * 10 ** decimals());
    }

    function decimals() public view virtual override returns (uint8) {
        return 6;
    }
}

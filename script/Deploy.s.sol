// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";
import "../src/BlobSocialVerified.sol";

contract DeployScript is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        // For Base Sepolia, we need to use a test registry address
        // Using a dummy address for now - we'll need to deploy or use an existing one
        address registryAddress = 0x0000000000000000000000000000000000000000;
        
        BlobSocialVerified social = new BlobSocialVerified(registryAddress);
        
        vm.stopBroadcast();
        
        console.log("BlobSocialVerified deployed to:", address(social));
    }
}
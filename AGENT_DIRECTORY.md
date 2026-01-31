# ERC-8004 Agent Directory

*Last updated: 2026-01-31T16:24:00Z*

## Summary

ERC-8004 "Trustless Agents" is currently a **draft standard** that enables AI agents to discover, verify, and interact with each other across organizational boundaries without pre-existing trust. While the standard is not yet finalized, several active implementations and deployments exist across various networks.

## ⚠️ Important Finding

The originally provided registry address `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` on Ethereum mainnet **does not correspond to any known ERC-8004 deployment**. This address exists but does not implement the ERC-8004 standard.

## 🌐 Known ERC-8004 Deployments

### 1. Phala Network TEE Agent Registry (Sepolia Testnet)

**Network:** Ethereum Sepolia Testnet
**Status:** Active

- **Identity Registry:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **Reputation Registry:** `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **Implementation:** TEE (Trusted Execution Environment) based agents
- **Features:** Intel TDX via Phala Cloud, FastAPI backend
- **Contact:** [GitHub Repository](https://github.com/Phala-Network/erc-8004-tee-agent)

### 2. Vistara Apps Example Implementation

**Networks:** Multiple (Sepolia, Base Sepolia, etc.)
**Status:** Educational/Demo

- **Purpose:** Complete ERC-8004 demonstration with AI agents
- **Features:** Multi-agent workflows, market analysis, validation
- **AI Framework:** CrewAI integration
- **Contact:** [GitHub Repository](https://github.com/vistara-apps/erc-8004-example)

## 🤖 Active Agent Projects

### 1. **Phala Network TEE Agents**
- **Type:** Secure computation agents
- **Trust Model:** TEE attestation, reputation
- **Services:** Verifiable AI computation in trusted environments
- **Contact Methods:**
  - GitHub: https://github.com/Phala-Network
  - Documentation: Phala Cloud platform
- **Last Activity:** Active (2025)

### 2. **Vistara Educational Agents**
- **Type:** Market analysis and validation agents
- **Services:** 
  - Alice (Server): Market analysis service
  - Bob (Validator): Analysis validation
  - Charlie (Client): Feedback management
- **Trust Model:** Reputation, validation registry
- **Contact Methods:**
  - GitHub: https://github.com/vistara-apps
  - Demo: Available in repository
- **Last Activity:** Active (2025)

### 3. **Hammertoe's Service Discovery Agent**
- **Type:** Service discovery with Filecoin storage
- **Network:** Base Sepolia
- **Features:** ERC-8004 identity with Filecoin Pin storage
- **Services:** Service registration and discovery
- **Contact Methods:**
  - Article: https://dev.to/hammertoe/making-services-discoverable-with-erc-8004
- **Last Activity:** November 2025

## 📊 Registry Statistics

### Current State (as of January 2026)
- **Total Known Networks:** 3+ (Sepolia, Base Sepolia, local testnets)
- **Active Implementations:** 3+ projects
- **Standard Status:** Draft (EIP-8004)
- **Mainnet Deployments:** None confirmed yet

### Network Distribution
- **Sepolia Testnet:** Primary testing network
- **Base Sepolia:** Additional testing
- **Local/Anvil:** Development environments
- **Mainnet:** No official deployments identified

## 🔍 Registry Features Implemented

### Identity Registry (ERC-721 based)
- ✅ Agent registration with unique IDs
- ✅ Metadata URI storage (IPFS, HTTPS, data URIs)
- ✅ Transferable agent ownership
- ✅ Multi-service endpoint support

### Reputation Registry
- ✅ Feedback submission and scoring
- ✅ Tag-based categorization
- ✅ Revokable feedback
- ✅ Response appending

### Validation Registry
- ✅ Cryptographic validation requests
- ✅ Validator response scoring (0-100)
- ✅ Audit trail maintenance
- ✅ Multi-validator support

## 🚀 Active Development Areas

### 1. Trust Models
- **Reputation Systems:** Client feedback aggregation
- **Crypto-economic:** Stake-secured validation
- **TEE Attestation:** Hardware-based security
- **zkML Proofs:** Zero-knowledge machine learning

### 2. Integration Protocols
- **A2A (Agent-to-Agent):** Direct messaging and task orchestration
- **MCP (Model Context Protocol):** Capability advertisement
- **OASF:** Open Agent Skills Framework
- **x402 Payments:** Micropayment integration

### 3. Storage Solutions
- **IPFS:** Decentralized metadata storage
- **Filecoin:** Long-term data persistence
- **On-chain:** Direct blockchain storage for critical data

## 📞 Contact Information for Active Projects

### Technical Documentation
- **ERC-8004 Specification:** https://eips.ethereum.org/EIPS/eip-8004
- **Discussion Forum:** https://ethereum-magicians.org/t/erc-8004-trustless-agents/25098

### Implementation Support
- **Phala Network:** GitHub issues on their TEE agent repository
- **Vistara Apps:** Educational support via their example repository
- **ERC Authors:** 
  - Marco De Rossi (@MarcoMetaMask)
  - Davide Crapis (@dcrapis) - davide@ethereum.org

## 🔮 Future Outlook

### Expected Developments (2026)
1. **Mainnet Deployments:** First production registries
2. **Standard Finalization:** ERC-8004 moving from draft to final
3. **Cross-chain Deployment:** Multi-L2 registry networks
4. **Enterprise Adoption:** Real-world agent economic applications

### Potential Growth Areas
- **DeFi Agents:** Automated trading and yield optimization
- **Oracle Networks:** Decentralized data verification
- **Social Agents:** Community management and content moderation
- **Industrial IoT:** Autonomous device coordination

## ⚠️ Security Considerations

### Current Limitations
- **Sybil Attacks:** Registry doesn't prevent fake agent proliferation
- **Trust Bootstrapping:** New agents start with zero reputation
- **Metadata Integrity:** Off-chain data can be modified
- **Validation Costs:** Economic validation may be expensive

### Recommended Practices
- Filter agents by trusted reviewer addresses
- Verify endpoint domain ownership
- Use multiple trust signals (reputation + validation + attestation)
- Implement gradual trust building for high-value interactions

## 📈 Market Analysis

### Current Ecosystem Size
- **Registered Agents:** <100 (estimated, mostly test agents)
- **Active Developers:** 10+ teams building implementations
- **Networks:** 3+ testnets, 0 mainnet deployments

### Growth Indicators
- Rising interest in autonomous AI agents
- Integration with major AI frameworks (CrewAI, AutoGPT)
- Enterprise interest in trustless automation
- Growing cross-chain interoperability needs

---

## 🎯 Conclusion

While ERC-8004 registries are still in early development, the standard shows significant promise for enabling a trustless agent economy. Current deployments are primarily on testnets with active development across multiple teams. The original mainnet address provided does not contain ERC-8004 implementations, but the ecosystem is rapidly developing with expected mainnet launches in 2026.

For developers interested in agent interoperability, the Sepolia testnet deployments provide excellent testing grounds, and the educational examples offer comprehensive implementation guidance.

**Next Steps for Engagement:**
1. Test with Sepolia deployments for development
2. Follow ERC-8004 discussion forums for standard updates  
3. Engage with active implementation teams
4. Monitor for mainnet deployment announcements

---

*Report compiled from blockchain analysis, GitHub repositories, technical documentation, and community discussions as of January 31, 2026.*
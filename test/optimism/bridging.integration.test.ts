import hre, { ethers } from "hardhat";
import { getNetworkConfig, getProvider } from "../../utils/deployment/network";
import { scenario } from "../../utils/testing";
import optimism from "../../utils/optimism";
import { impersonate } from "../../utils/account";
import { createOptimismBridgeDeployScripts } from "../../utils/deployment/optimism";
import {
  CrossDomainMessengerStub__factory,
  ERC20Bridged__factory,
  ERC20BridgedStub__factory,
  L1ERC20TokenBridge__factory,
  L2ERC20TokenBridge__factory,
} from "../../typechain";
import { wei } from "../../utils/wei";
import { Wallet } from "ethers";
import { assert } from "chai";
import bridging from "../../utils/bridging";

scenario("Optimism :: Bridging integration test", ctxProvider, (ctx) => {
  it("1. Activate Bridging", async () => {
    const { admin } = ctx.l1.accounts;
    const { l1ERC20TokenBridge } = ctx.l1;
    const { l2ERC20TokenBridge } = ctx.l2;

    await bridging.grantRoles(l1ERC20TokenBridge, {
      depositEnablers: [admin.address],
      withdrawalsEnablers: [admin.address],
    });
    await bridging.grantRoles(l2ERC20TokenBridge, {
      depositEnablers: [admin.address],
      withdrawalsEnablers: [admin.address],
    });
    await bridging.activate(l1ERC20TokenBridge);
    await bridging.activate(l2ERC20TokenBridge);

    assert.isTrue(await l1ERC20TokenBridge.isDepositsEnabled());
    assert.isTrue(await l1ERC20TokenBridge.isWithdrawalsEnabled());
    assert.isTrue(await l2ERC20TokenBridge.isDepositsEnabled());
    assert.isTrue(await l2ERC20TokenBridge.isWithdrawalsEnabled());
  });

  it("2. Sender deposits tokens to himself via depositERC20()", async () => {
    const { l1Token, l1ERC20TokenBridge } = ctx.l1;
    const { l2Token } = ctx.l2;
    const { sender } = ctx.l1.accounts;

    const depositAmount = wei`5 ether`;
    await l1Token
      .connect(sender)
      .approve(l1ERC20TokenBridge.address, depositAmount);

    const senderBalanceBefore = await l1Token.balanceOf(sender.address);

    const tx = await l1ERC20TokenBridge
      .connect(sender)
      .depositERC20(
        l1Token.address,
        l2Token.address,
        depositAmount,
        200_000,
        "0x"
      );

    await assert.emits(l1ERC20TokenBridge, tx, "ERC20DepositInitiated", [
      l1Token.address,
      l2Token.address,
      sender.address,
      sender.address,
      depositAmount,
      "0x",
    ]);

    // TODO: Check event TransactionEnqueued emitted by the CanonicalTransactionChain

    assert.equalBN(
      await l1Token.balanceOf(l1ERC20TokenBridge.address),
      depositAmount
    );

    assert.equalBN(
      await l1Token.balanceOf(sender.address),
      senderBalanceBefore.sub(depositAmount)
    );
  });

  it("3. Finalize deposit via finalizeDeposit() on L2", async () => {
    const { sender } = ctx.l1.accounts;
    const { l1Token, l1ERC20TokenBridge } = ctx.l1;
    const { l2Token, l2CrossDomainMessenger, l2ERC20TokenBridge } = ctx.l2;
    const { depositAmount } = ctx.common;

    const tx = await l2CrossDomainMessenger.relayMessage(
      l2ERC20TokenBridge.address,
      l1ERC20TokenBridge.address,
      l2ERC20TokenBridge.interface.encodeFunctionData("finalizeDeposit", [
        l1Token.address,
        l2Token.address,
        sender.address,
        sender.address,
        depositAmount,
        "0x",
      ]),
      1
    );

    await assert.emits(l2ERC20TokenBridge, tx, "DepositFinalized", [
      l1Token.address,
      l2Token.address,
      sender.address,
      sender.address,
      depositAmount,
      "0x",
    ]);

    assert.equalBN(await l2Token.totalSupply(), depositAmount);
    assert.equalBN(await l2Token.balanceOf(sender.address), depositAmount);
  });

  it("4. Sender withdraws tokens to himself via withdraw()", async () => {
    const { l1Token } = ctx.l1;
    const { l2ERC20TokenBridge, l2Token } = ctx.l2;
    const { sender } = ctx.l2.accounts;

    const withdrawalAmount = wei`2.5 ether`;
    const senderBalanceBefore = await l2Token.balanceOf(sender.address);
    const l2TotalSupplyBefore = await l2Token.totalSupply();

    const tx = await l2ERC20TokenBridge
      .connect(sender)
      .withdraw(l2Token.address, withdrawalAmount, 0, "0x");

    await assert.emits(l2ERC20TokenBridge, tx, "WithdrawalInitiated", [
      l1Token.address,
      l2Token.address,
      sender.address,
      sender.address,
      withdrawalAmount,
      "0x",
    ]);

    assert.equalBN(
      await l2Token.balanceOf(sender.address),
      senderBalanceBefore.sub(withdrawalAmount)
    );

    assert.equalBN(
      await l2Token.totalSupply(),
      l2TotalSupplyBefore.sub(withdrawalAmount)
    );
  });

  it("5. Finalize withdrawal via finalizeERC20Withdrawal()", async () => {
    const { l1CrossDomainMessengerStub, l1ERC20TokenBridge, l1Token } = ctx.l1;
    const { l2CrossDomainMessenger, l2Token, l2ERC20TokenBridge } = ctx.l2;
    const { sender } = ctx.l2.accounts;
    const { withdrawalAmount } = ctx.common;

    await l1CrossDomainMessengerStub.setXDomainMessageSender(
      l2ERC20TokenBridge.address
    );

    const tx = await l1CrossDomainMessengerStub.relayMessage(
      l1ERC20TokenBridge.address,
      l2CrossDomainMessenger.address,
      l1ERC20TokenBridge.interface.encodeFunctionData(
        "finalizeERC20Withdrawal",
        [
          l1Token.address,
          l2Token.address,
          sender.address,
          sender.address,
          withdrawalAmount,
          "0x",
        ]
      ),
      0
    );

    await assert.emits(l1ERC20TokenBridge, tx, "ERC20WithdrawalFinalized", [
      l1Token.address,
      l2Token.address,
      sender.address,
      sender.address,
      withdrawalAmount,
      "0x",
    ]);
  });

  it("6. Sender deposits tokens to recipient via depositERC20To()", async () => {
    const { l1Token, l1ERC20TokenBridge } = ctx.l1;
    const { l2Token } = ctx.l2;
    const { sender, recipient } = ctx.l1.accounts;

    const depositAmount = wei`5 ether`;
    await l1Token
      .connect(sender)
      .approve(l1ERC20TokenBridge.address, depositAmount);

    const senderBalanceBefore = await l1Token.balanceOf(sender.address);
    const l1ERC20TokenBridgeBalanceBefore = await l1Token.balanceOf(
      l1ERC20TokenBridge.address
    );

    const tx = await l1ERC20TokenBridge
      .connect(sender)
      .depositERC20To(
        l1Token.address,
        l2Token.address,
        recipient.address,
        depositAmount,
        200_000,
        "0x"
      );

    await assert.emits(l1ERC20TokenBridge, tx, "ERC20DepositInitiated", [
      l1Token.address,
      l2Token.address,
      sender.address,
      recipient.address,
      depositAmount,
      "0x",
    ]);

    // TODO: Check event TransactionEnqueued emitted by the CanonicalTransactionChain

    assert.equalBN(
      await l1Token.balanceOf(l1ERC20TokenBridge.address),
      l1ERC20TokenBridgeBalanceBefore.add(depositAmount)
    );

    assert.equalBN(
      await l1Token.balanceOf(sender.address),
      senderBalanceBefore.sub(depositAmount)
    );
  });
  it("7. Finalize deposit via finalizeDeposit()", async () => {
    const { sender, recipient } = ctx.l1.accounts;
    const { l1Token, l1ERC20TokenBridge } = ctx.l1;
    const { l2Token, l2CrossDomainMessenger, l2ERC20TokenBridge } = ctx.l2;
    const { depositAmount } = ctx.common;

    const l2TokenTotalSupplyBefore = await l2Token.totalSupply();
    const recipientBalanceBefore = await l2Token.balanceOf(recipient.address);

    const tx = await l2CrossDomainMessenger.relayMessage(
      l2ERC20TokenBridge.address,
      l1ERC20TokenBridge.address,
      l2ERC20TokenBridge.interface.encodeFunctionData("finalizeDeposit", [
        l1Token.address,
        l2Token.address,
        sender.address,
        recipient.address,
        depositAmount,
        "0x",
      ]),
      1
    );

    await assert.emits(l2ERC20TokenBridge, tx, "DepositFinalized", [
      l1Token.address,
      l2Token.address,
      sender.address,
      recipient.address,
      depositAmount,
      "0x",
    ]);

    assert.equalBN(
      await l2Token.totalSupply(),
      l2TokenTotalSupplyBefore.add(depositAmount)
    );
    assert.equalBN(
      await l2Token.balanceOf(recipient.address),
      recipientBalanceBefore.add(depositAmount)
    );
  });

  it("8. Recipient withdraws tokens to sender via withdrawTo()", async () => {
    const { l1Token } = ctx.l1;
    const { l2ERC20TokenBridge, l2Token } = ctx.l2;
    const { sender, recipient } = ctx.l2.accounts;
    const { withdrawalAmount } = ctx.common;

    const recipientBalanceBefore = await l2Token.balanceOf(recipient.address);
    const l2TotalSupplyBefore = await l2Token.totalSupply();

    const tx = await l2ERC20TokenBridge
      .connect(recipient)
      .withdrawTo(l2Token.address, sender.address, withdrawalAmount, 0, "0x");

    await assert.emits(l2ERC20TokenBridge, tx, "WithdrawalInitiated", [
      l1Token.address,
      l2Token.address,
      recipient.address,
      sender.address,
      withdrawalAmount,
      "0x",
    ]);

    assert.equalBN(
      await l2Token.balanceOf(recipient.address),
      recipientBalanceBefore.sub(withdrawalAmount)
    );

    assert.equalBN(
      await l2Token.totalSupply(),
      l2TotalSupplyBefore.sub(withdrawalAmount)
    );
  });
  it("9. Finalize withdrawal via finalizeERC20Withdrawal()", async () => {
    const { l1CrossDomainMessengerStub, l1ERC20TokenBridge, l1Token } = ctx.l1;
    const { l2CrossDomainMessenger, l2Token, l2ERC20TokenBridge } = ctx.l2;
    const { sender, recipient } = ctx.l2.accounts;
    const { withdrawalAmount } = ctx.common;

    await l1CrossDomainMessengerStub.setXDomainMessageSender(
      l2ERC20TokenBridge.address
    );

    const tx = await l1CrossDomainMessengerStub.relayMessage(
      l1ERC20TokenBridge.address,
      l2CrossDomainMessenger.address,
      l1ERC20TokenBridge.interface.encodeFunctionData(
        "finalizeERC20Withdrawal",
        [
          l1Token.address,
          l2Token.address,
          recipient.address,
          sender.address,
          withdrawalAmount,
          "0x",
        ]
      ),
      0
    );

    await assert.emits(l1ERC20TokenBridge, tx, "ERC20WithdrawalFinalized", [
      l1Token.address,
      l2Token.address,
      recipient.address,
      sender.address,
      withdrawalAmount,
      "0x",
    ]);
  });
});

async function ctxProvider() {
  const privateKeys = {
    deployer:
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    sender:
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    recipient:
      "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  };
  const l1Network = getNetworkConfig("local", hre);
  const l2Network = getNetworkConfig("local_optimism", hre);
  const l1Provider = getProvider(l1Network.url);
  const l2Provider = getProvider(l2Network.url);

  const l1Deployer = new Wallet(privateKeys.deployer, l1Provider);
  const l2Deployer = new Wallet(privateKeys.deployer, l2Provider);

  const l1Token = await new ERC20BridgedStub__factory(l1Deployer).deploy(
    "Test Token",
    "TT"
  );

  const l1CrossDomainMessengerStub =
    await new CrossDomainMessengerStub__factory(l1Deployer).deploy();

  const [l1DeployScript, l2DeployScript] =
    await createOptimismBridgeDeployScripts(
      l1Token.address,
      {
        deployer: l1Deployer,
        admins: { proxy: l1Deployer.address, bridge: l1Deployer.address },
      },
      {
        deployer: l2Deployer,
        admins: { proxy: l2Deployer.address, bridge: l2Deployer.address },
      },
      {
        dependencies: { l1: { messenger: l1CrossDomainMessengerStub.address } },
      }
    );

  await l1DeployScript.run();
  await l2DeployScript.run();

  const l2Token = ERC20Bridged__factory.connect(
    l2DeployScript.getContractAddress(1),
    l2Deployer
  );
  const l2ERC20TokenBridge = L2ERC20TokenBridge__factory.connect(
    l2DeployScript.getContractAddress(3),
    l2Deployer
  );
  const l1ERC20TokenBridge = L1ERC20TokenBridge__factory.connect(
    l1DeployScript.getContractAddress(1),
    l1Deployer
  );

  const l1CrossDomainMessenger =
    await optimism.contracts.l1.L1CrossDomainMessenger(l1Deployer);

  const l1CrossDomainMessengerAliased = await impersonate(
    applyL1ToL2Alias(l1CrossDomainMessenger.address),
    l2Provider
  );

  const l2CrossDomainMessenger =
    await optimism.contracts.l2.L2CrossDomainMessenger(
      l1CrossDomainMessengerAliased
    );

  await l2Deployer.sendTransaction({
    to: await l1CrossDomainMessengerAliased.getAddress(),
    value: wei`10 ether`,
  });

  const l1Sender = new Wallet(privateKeys.sender, l1Provider);
  await l1Token.transfer(l1Sender.address, wei`100 ether`);

  return {
    l1: {
      l1Token: l1Token.connect(l1Sender),
      l1ERC20TokenBridge: l1ERC20TokenBridge,
      l1CrossDomainMessengerStub,
      canonicalTransactionChain:
        await optimism.contracts.l1.CanonicalTransactionChain(l1Deployer),
      accounts: {
        admin: l1Deployer,
        sender: l1Sender,
        recipient: new Wallet(privateKeys.recipient, l1Provider),
      },
    },
    l2: {
      l2Token: l2Token,
      l2ERC20TokenBridge,
      l2CrossDomainMessenger,
      accounts: {
        admin: l2Deployer,
        l1CrossDomainMessengerAliased,
        sender: new Wallet(privateKeys.sender, l2Provider),
        recipient: new Wallet(privateKeys.recipient, l2Provider),
      },
    },
    common: {
      depositAmount: wei`5 ether`,
      withdrawalAmount: wei`2.5 ether`,
    },
  };
}

function applyL1ToL2Alias(address: string) {
  const offset = "0x1111000000000000000000000000000000001111";
  const mask = ethers.BigNumber.from(2).pow(160);
  return hre.ethers.utils.getAddress(
    hre.ethers.BigNumber.from(address).add(offset).mod(mask).toHexString()
  );
}

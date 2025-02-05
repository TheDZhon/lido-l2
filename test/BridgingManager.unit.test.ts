import hre from "hardhat";
import {
  BridgingManager__factory,
  OssifiableProxy__factory,
} from "../typechain";
import { assert } from "chai";
import { testsuite, accessControlRevertMessage } from "../utils/testing";

testsuite("BridgingManager unit tests", ctxBuilder, (ctx) => {
  it("isInitialized() :: on uninitialized contract", async () => {
    assert.isFalse(await ctx.bridgingManagerRaw.isInitialized());
  });

  it("isDepositsEnabled() :: on uninitialized contract", async () => {
    assert.isFalse(await ctx.bridgingManagerRaw.isDepositsEnabled());
  });

  it("isWithdrawalsEnabled() :: on uninitialized contract", async () => {
    assert.isFalse(await ctx.bridgingManagerRaw.isWithdrawalsEnabled());
  });

  it("initialize() :: on uninitialized contract", async () => {
    const {
      bridgingManagerRaw,
      roles: { DEFAULT_ADMIN_ROLE },
      accounts: { stranger },
    } = ctx;
    // validate that bridgingManager is not initialized
    assert.isFalse(await bridgingManagerRaw.isInitialized());

    // validate that stranger has no DEFAULT_ADMIN_ROLE
    assert.isFalse(
      await bridgingManagerRaw.hasRole(DEFAULT_ADMIN_ROLE, stranger.address)
    );
    // initialize() might be called by anyone
    await bridgingManagerRaw.connect(stranger).initialize(stranger.address);

    // validate that isInitialized() is true
    assert.isTrue(await bridgingManagerRaw.isInitialized());

    // validate that stranger has DEFAULT_ADMIN_RULE
    assert.isTrue(
      await bridgingManagerRaw.hasRole(DEFAULT_ADMIN_ROLE, stranger.address)
    );

    // validate that initialize() might not be called second time
    await assert.revertsWith(
      bridgingManagerRaw.connect(stranger).initialize(stranger.address),
      "ErrorAlreadyInitialized()"
    );
  });

  it("enableDeposits() :: role is not granted", async () => {
    const {
      bridgingManager,
      accounts: { stranger },
      roles: { DEPOSITS_ENABLER_ROLE },
    } = ctx;

    // validate that deposits are disabled
    assert.isFalse(await bridgingManager.isDepositsEnabled());

    // validate that stranger has no DEPOSITS_ENABLER_ROLE
    assert.isFalse(
      await bridgingManager.hasRole(DEPOSITS_ENABLER_ROLE, stranger.address)
    );

    await assert.revertsWith(
      bridgingManager.connect(stranger).enableDeposits(),
      accessControlRevertMessage(DEPOSITS_ENABLER_ROLE, stranger.address)
    );
  });

  it("enableDeposits() :: role is granted", async () => {
    const {
      bridgingManager,
      accounts: { depositsEnabler },
    } = ctx;

    // validate that deposits are disabled
    assert.isFalse(await bridgingManager.isDepositsEnabled());

    // validate that depositsEnabler can enable deposits
    const tx = await bridgingManager.connect(depositsEnabler).enableDeposits();

    // validate that DepositsEnabled(enabler) event was emitted
    assert.emits(bridgingManager, tx, "DepositsEnabled", [
      depositsEnabler.address,
    ]);

    // validate that deposits are enabled
    assert.isTrue(await bridgingManager.isDepositsEnabled());

    // validate that deposits can't be enabled if it's already enabled
    await assert.revertsWith(
      bridgingManager.connect(depositsEnabler).enableDeposits(),
      "ErrorDepositsEnabled()"
    );
  });

  it("disableDeposits() :: deposits disabled", async () => {
    const {
      bridgingManager,
      accounts: { depositsDisabler },
    } = ctx;

    // validate that deposits are disabled
    assert.isFalse(await bridgingManager.isDepositsEnabled());

    // validate that disableDeposits reverts with error ErrorDepositsDisabled()
    await assert.revertsWith(
      bridgingManager.connect(depositsDisabler).disableDeposits(),
      "ErrorDepositsDisabled()"
    );
  });

  it("disableDeposits() :: role is not granted", async () => {
    const {
      bridgingManager,
      accounts: { stranger, depositsEnabler },
      roles: { DEPOSITS_DISABLER_ROLE },
    } = ctx;

    // enable deposits
    await bridgingManager.connect(depositsEnabler).enableDeposits();

    // validate deposits are enabled
    assert.isTrue(await bridgingManager.isDepositsEnabled());

    // validate that stranger has no DEPOSITS_DISABLER_ROLE
    assert.isFalse(
      await bridgingManager.hasRole(DEPOSITS_DISABLER_ROLE, stranger.address)
    );

    await assert.revertsWith(
      bridgingManager.connect(stranger).disableDeposits(),
      accessControlRevertMessage(DEPOSITS_DISABLER_ROLE, stranger.address)
    );
  });

  it("disableDeposits() :: role is granted", async () => {
    const {
      bridgingManager,
      accounts: { depositsEnabler, depositsDisabler },
    } = ctx;

    // enable deposits
    await bridgingManager.connect(depositsEnabler).enableDeposits();

    // validate that deposits are enabled
    assert.isTrue(await bridgingManager.isDepositsEnabled());

    // validate that depositsDisabler can disable deposits
    const tx = await bridgingManager
      .connect(depositsDisabler)
      .disableDeposits();

    // validate that DepositsDisabled(disabler) event was emitted
    assert.emits(bridgingManager, tx, "DepositsDisabled", [
      depositsDisabler.address,
    ]);

    // validate that deposits are not active
    assert.isFalse(await bridgingManager.isDepositsEnabled());

    // validate that deposits can't be disabled if it's not active
    await assert.revertsWith(
      bridgingManager.connect(depositsDisabler).disableDeposits(),
      "ErrorDepositsDisabled()"
    );
  });

  it("enableWithdrawals() :: role is not granted", async () => {
    const {
      bridgingManager,
      accounts: { stranger },
      roles: { WITHDRAWALS_ENABLER_ROLE },
    } = ctx;

    // validate that withdrawals are disabled
    assert.isFalse(await bridgingManager.isWithdrawalsEnabled());

    // validate that stranger has no WITHDRAWALS_ENABLER_ROLE
    assert.isFalse(
      await bridgingManager.hasRole(WITHDRAWALS_ENABLER_ROLE, stranger.address)
    );

    await assert.revertsWith(
      bridgingManager.connect(stranger).enableWithdrawals(),
      accessControlRevertMessage(WITHDRAWALS_ENABLER_ROLE, stranger.address)
    );
  });

  it("enableWithdrawals() :: role is granted", async () => {
    const {
      bridgingManager,
      accounts: { withdrawalsEnabler },
    } = ctx;

    // validate that withdrawals are disabled
    assert.isFalse(await bridgingManager.isWithdrawalsEnabled());

    // validate that withdrawalsEnabler can enable withdrawals
    const tx = await bridgingManager
      .connect(withdrawalsEnabler)
      .enableWithdrawals();

    // validate that WithdrawalsEnabled(enabler) event was emitted
    assert.emits(bridgingManager, tx, "WithdrawalsEnabled", [
      withdrawalsEnabler.address,
    ]);

    // validate that withdrawals are enabled
    assert.isTrue(await bridgingManager.isWithdrawalsEnabled());

    // validate that withdrawals can't be enabled if it's already enabled
    await assert.revertsWith(
      bridgingManager.connect(withdrawalsEnabler).enableWithdrawals(),
      "ErrorWithdrawalsEnabled()"
    );
  });

  it("disableWithdrawals() :: withdrawals disabled", async () => {
    const {
      bridgingManager,
      accounts: { withdrawalsDisabler },
    } = ctx;

    // validate that deposits are disabled
    assert.isFalse(await bridgingManager.isDepositsEnabled());

    // validate that disableWithdrawals reverts with error ErrorWithdrawalsDisabled()
    await assert.revertsWith(
      bridgingManager.connect(withdrawalsDisabler).disableWithdrawals(),
      "ErrorWithdrawalsDisabled()"
    );
  });

  it("disableWithdrawals() :: role is not granted", async () => {
    const {
      bridgingManager,
      accounts: { stranger, withdrawalsEnabler },
      roles: { WITHDRAWALS_DISABLER_ROLE },
    } = ctx;

    // enable withdrawals
    await bridgingManager.connect(withdrawalsEnabler).enableWithdrawals();

    // validate withdrawals are enabled
    assert.isTrue(await bridgingManager.isWithdrawalsEnabled());

    // validate that stranger has no WITHDRAWALS_DISABLER_ROLE
    assert.isFalse(
      await bridgingManager.hasRole(WITHDRAWALS_DISABLER_ROLE, stranger.address)
    );

    await assert.revertsWith(
      bridgingManager.connect(stranger).disableWithdrawals(),
      accessControlRevertMessage(WITHDRAWALS_DISABLER_ROLE, stranger.address)
    );
  });

  it("disableWithdrawals() :: role is granted", async () => {
    const {
      bridgingManager,
      accounts: { withdrawalsEnabler, withdrawalsDisabler },
    } = ctx;

    // enable withdrawals
    await bridgingManager.connect(withdrawalsEnabler).enableWithdrawals();

    // validate that withdrawals are enabled
    assert.isTrue(await bridgingManager.isWithdrawalsEnabled());

    // validate that withdrawalsDisabler can disable withdrawals
    const tx = await bridgingManager
      .connect(withdrawalsDisabler)
      .disableWithdrawals();

    // validate that WithdrawalsDisabled(disabler) event was emitted
    assert.emits(bridgingManager, tx, "WithdrawalsDisabled", [
      withdrawalsDisabler.address,
    ]);

    // validate that withdrawals are not active
    assert.isFalse(await bridgingManager.isWithdrawalsEnabled());

    // validate that withdrawals can't be disabled if it's not active
    await assert.revertsWith(
      bridgingManager.connect(withdrawalsDisabler).disableWithdrawals(),
      "ErrorWithdrawalsDisabled()"
    );
  });
});

async function ctxBuilder() {
  const [
    deployer,
    stranger,
    depositsEnabler,
    depositsDisabler,
    withdrawalsEnabler,
    withdrawalsDisabler,
  ] = await hre.ethers.getSigners();

  const bridgingManagerImpl = await new BridgingManager__factory(
    deployer
  ).deploy();
  const pureOssifiableProxy = await new OssifiableProxy__factory(
    deployer
  ).deploy(bridgingManagerImpl.address, deployer.address, "0x");
  const initializedOssifiableProxy = await new OssifiableProxy__factory(
    deployer
  ).deploy(bridgingManagerImpl.address, deployer.address, "0x");

  const bridgingManager = BridgingManager__factory.connect(
    initializedOssifiableProxy.address,
    deployer
  );
  await bridgingManager.initialize(deployer.address);

  const [
    DEFAULT_ADMIN_ROLE,
    DEPOSITS_ENABLER_ROLE,
    DEPOSITS_DISABLER_ROLE,
    WITHDRAWALS_ENABLER_ROLE,
    WITHDRAWALS_DISABLER_ROLE,
  ] = await Promise.all([
    await bridgingManagerImpl.DEFAULT_ADMIN_ROLE(),
    await bridgingManagerImpl.DEPOSITS_ENABLER_ROLE(),
    await bridgingManagerImpl.DEPOSITS_DISABLER_ROLE(),
    await bridgingManagerImpl.WITHDRAWALS_ENABLER_ROLE(),
    await bridgingManagerImpl.WITHDRAWALS_DISABLER_ROLE(),
  ]);
  await bridgingManager.grantRole(
    DEPOSITS_ENABLER_ROLE,
    depositsEnabler.address
  );
  await bridgingManager.grantRole(
    DEPOSITS_DISABLER_ROLE,
    depositsDisabler.address
  );
  await bridgingManager.grantRole(
    WITHDRAWALS_ENABLER_ROLE,
    withdrawalsEnabler.address
  );
  await bridgingManager.grantRole(
    WITHDRAWALS_DISABLER_ROLE,
    withdrawalsDisabler.address
  );

  return {
    roles: {
      DEFAULT_ADMIN_ROLE,
      DEPOSITS_ENABLER_ROLE,
      DEPOSITS_DISABLER_ROLE,
      WITHDRAWALS_ENABLER_ROLE,
      WITHDRAWALS_DISABLER_ROLE,
    },
    accounts: {
      deployer,
      stranger,
      depositsEnabler,
      depositsDisabler,
      withdrawalsEnabler,
      withdrawalsDisabler,
    },
    bridgingManager,
    bridgingManagerRaw: BridgingManager__factory.connect(
      pureOssifiableProxy.address,
      deployer
    ),
  };
}

'use strict';

exports.default = async function (configuration) {
  if (!configuration.path) return;

  const { execSync } = require("child_process");

  const keypairAlias = process.env.SM_KEYPAIR_ALIAS;
  if (!keypairAlias) {
    console.warn("SM_KEYPAIR_ALIAS not set, skipping DigiCert KeyLocker signing");
    return;
  }

  console.log(`Signing: ${configuration.path}`);

  try {
    execSync(
      `smctl sign --keypair-alias="${keypairAlias}" --input "${String(configuration.path)}" -v`,
      { stdio: "inherit" }
    );
    console.log(`Signed successfully: ${configuration.path}`);
  } catch (error) {
    console.error(`Signing failed for ${configuration.path}:`, error.message);
    throw error;
  }
};

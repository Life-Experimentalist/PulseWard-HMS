function resolveSecretRef(credentialsRef) {
  if (!credentialsRef || !credentialsRef.secretKey) {
    return null;
  }

  var value = process.env[credentialsRef.secretKey];
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (_error) {
    return { raw: value };
  }
}

module.exports = {
  resolveSecretRef,
};

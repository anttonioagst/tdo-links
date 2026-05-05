export async function publishXAcquisition(text, config) {
  return {
    ok: true,
    dryRun: true,
    providerMessageId: null,
    detail: config.xDryRun ? "X dry-run ativo no MVP." : "Publicação real no X não habilitada neste MVP.",
    text
  };
}

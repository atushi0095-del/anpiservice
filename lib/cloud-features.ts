export function areClientCloudFeaturesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_CLOUD_FEATURES_ENABLED === "true";
}

export function areServerCloudFeaturesEnabled(): boolean {
  return process.env.CLOUD_FEATURES_ENABLED === "true";
}

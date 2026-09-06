/* Activation requires the owner's provider/privacy/account decisions and verification. */
window.ROZA_MEASUREMENT_CONFIG = Object.freeze({
  enabled: false,
  provider: null,
  measurementId: "",
  privacyApproved: false,
  enhancedMeasurementDisabled: false,
  advertisingFeaturesDisabled: false,
  allowedOrigins: [],
  siteBasePath: "/rozas-mestia/",
  retentionDays: null,
  campaigns: [
    { source: "google", medium: "cpc", campaign: "mestia_search_pilot_01" }
  ]
});

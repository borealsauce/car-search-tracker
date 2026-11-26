// Car Search Tracker client settings. Public file: never put secrets here.
// SUBMIT_WEBHOOK_URL: where the "New search" form POSTs its JSON request. Leave the placeholder
// until the webhook exists; the form then explains submissions aren't connected and offers the JSON to copy.
// SUBMIT_MODE: 'no-cors' (default; works with webhooks that don't send CORS headers, response can't be read)
//              or 'cors' (use if the webhook replies with Access-Control-Allow-Origin; errors are then shown).
window.TRACKER_CONFIG = {
  SUBMIT_WEBHOOK_URL: 'SUBMIT_WEBHOOK_URL',
  SUBMIT_MODE: 'no-cors',
  RESULTS_ETA: '~30-60 min'
};

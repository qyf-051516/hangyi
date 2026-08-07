// Loads test-helper.js to set up global mock state and intercept wx-server-sdk require.
const path = require("path");
const Module = require("module");

// Set up the mock state and the wx-server-sdk require hook from test-helper.
require("./test-helper");

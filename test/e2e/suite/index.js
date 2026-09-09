const path = require("path");
const Mocha = require("mocha");

function run() {
  const mocha = new Mocha({ ui: "tdd", timeout: 20000 });
  mocha.addFile(path.join(__dirname, "..", "extension.test.js"));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => (failures > 0 ? reject(new Error(failures + " tests failed")) : resolve()));
  });
}

module.exports = { run };

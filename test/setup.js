"use strict";
process.env.NODE_ENV = 'test';
process.env.TOPIX_DATA_DIR = '/tmp/topix-test';
const noop = () => { };
global.console = {
    ...console,
    log: noop,
    debug: noop,
    info: noop,
};
//# sourceMappingURL=setup.js.map
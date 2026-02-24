"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const garmin_empirbus_ts_1 = require("garmin-empirbus-ts");
const repo = new garmin_empirbus_ts_1.EmpirBusChannelRepository('ws://192.168.1.1:8888/ws');
repo.connect();
setInterval(() => {
    console.log(repo.getChannelList());
}, 5 * 1000);
//# sourceMappingURL=index.js.map
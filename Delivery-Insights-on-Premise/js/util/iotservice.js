"use strict";

var axios = require("axios");

class iotservice {

  static config() {
    return JSON.parse(process.env.IoTService);
  }

  static getHandlingUnitSensor(handlingUnitId) {
    return new Promise(function(resolve, reject) {
      var iotServiceConfig = iotservice.config();
      var sensorName = "HUMaterial_" + handlingUnitId;
      var sensorUrl = iotServiceConfig.apiUrl + "/iot/core/api/v1/tenant/" + iotServiceConfig.tenantId + "/sensors?filter=name%20eq%20'" + sensorName + "'";

      var basicAuth = Buffer.from(iotServiceConfig.username + ":" + iotServiceConfig.password).toString('base64');
      var start = new Date();
      axios.get(sensorUrl, { "headers": { "Authorization": "Basic " +  basicAuth} })
      .then(response => {
        console.info("getHandlingUnitSensor: " + sensorUrl + " " + (new Date().getTime()-start.getTime()) + "ms");
        if (response.data && response.data.length === 1) {
          resolve(response.data[0]);
        } else if (response.data && response.data.length > 1) {
          reject(new Error("Found more than one sensor for handling unit " + handlingUnitId));
        } else {
          reject(new Error("Could not find sensor for handling unit " + handlingUnitId));
        }
      })
      .catch(error => {
        reject(error);
      });
    });
  }
}
module.exports = iotservice;

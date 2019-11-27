"use strict";

var xssec = require("@sap/xssec");
var xsenv = require('@sap/xsenv');
var axios = require("axios");
var fs = require("fs");
var iotservice = require("../util/iotservice");
var s4 = require("../util/s4");
var extend = require('util')._extend;
var bIsRunning = false;

class iotae {
  /**
   * Get the AE configuration from the service binding
   */
  static iotAEConfig() {
    return xsenv.getServices({
      iotae: { tag: "iotae" }
    }).iotae;
  }

  /**
   * Get the bearer token for making AE API requests
   */
  static token(req) {
    return new Promise(function(resolve, reject) {
      req.authInfo.requestToken(iotae.iotAEConfig().uaa, xssec.constants.TYPE_CLIENT_CREDENTIALS_TOKEN, null, (error, token) => {
        if (error) {
          reject(error);
        } else {
          resolve(token);
        }
      });
    });
  }

  /**
   * Process material deliveries from S4
   */
  static processS4(req) {
    var ts = 20190915140101;
    var start = new Date();
    return new Promise(function(resolve, reject) {
      s4.getMaterialDeliveries(ts)
      .then(materialDeliveries => {
        iotae.process(req, materialDeliveries, start)
        .then(processedMaterialDeliveries => {
          resolve(processedMaterialDeliveries);
        })
        .catch((error) => { reject(new Error("Error processing deliveries in Leonardo IoT: " + error.message)); });
      })
      .catch((error) => { reject(new Error("Error getting deliveries from S/4 HANA: " + error.message)); });
    });
  }

  /**
   * Process an array of material deliveries
   */
  static process(req, materialDeliveries, start) {
    return iotae.processMaterialDeliveries(req, materialDeliveries, start);
  }

  /**
   * Process the local test file
   */
  static processLocal(req) {
    var json = fs.readFileSync("material-deliveries.json", "utf8");
    return iotae.processMaterialDeliveries(req, JSON.parse(json));
  }

  /**
   * Delete all things that were created by this script
   *
   * @returns Promise that resolves with no parameters
   */
  static deleteThings(req) {
    return new Promise(function(resolve, reject) {

      iotae.token(req)
      .then((token) => {
        iotae.getAllThingsByAlternateId(token)
        .then(allThings => {

          var allThingDeletePromises = [];
          allThings.forEach((thing) => {
            if (thing) {
              allThingDeletePromises.push(
                iotae.deleteThing(token, thing._id)
                .catch(error => {
                  // do nothing, maybe it doesn't exist anymore
                })
              );
            }
          });

          Promise.all(allThingDeletePromises)
          .then(() => {
            resolve();
          })
          .catch(error => {
            reject(error);
          });
        })
        .catch(error => {
          reject(error);
        });
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Process an array of material deliveries
   *
   * @Promise that resolves with an array of processed material deliveries parameter
   */
  static processMaterialDeliveries(req, materialDeliveries, start) {
    var ioTIntegrationConfig = JSON.parse(process.env.IoTIntegration);
    return new Promise(function(resolve, reject) {
      if (bIsRunning) {
        reject(new Error("Material deliveries are currently being processed and " +
          "should not be run more than once at a time"));
      } else {
        bIsRunning = true;
        if (!start) {
          start = new Date();
        }
        iotae.token(req)
        .then((token) => {
          var allMaterialDeliveryPromises = [];
          var allThingAlternateIds = [];
          materialDeliveries.forEach((materialDelivery) => {
            allMaterialDeliveryPromises.push(iotae.processMaterialDelivery(token, ioTIntegrationConfig.package, materialDelivery, allThingAlternateIds));
          });
          Promise.all(allMaterialDeliveryPromises)
          .then((processedMaterialDeliveries) => {
            bIsRunning = false;
            var errorFound = processedMaterialDeliveries.find(function(element) {
              return (element.error) ? true : false;
            });
            var end = new Date();
            // TODO: take into account S4 processing time
            resolve({
              start: start,
              end: end,
              durationMs: end.getTime()-start.getTime(),
              numberProcessed: processedMaterialDeliveries.length,
              processed: processedMaterialDeliveries,
              errorFound: (errorFound) ? true : false
            });
          })
          .catch(error => {
            bIsRunning = false;
            reject(error);
          });
        })
        .catch(error => {
          bIsRunning = false;
          reject(error);
        });
      }
    });
  }

  /**
   * Process a single material delivery
   *
   * @returns Promise that resolves with processed material delivery (pmd) parameter
   */
  static processMaterialDelivery(token, packageName, materialDelivery, allThingAlternateIds) {
    return new Promise(function(resolve, reject) {
      var thingType = packageName + ":MaterialT_" + materialDelivery.MaterialType;
      var pmd = iotae.createProcessedMaterialDelivery(packageName, thingType, materialDelivery);
      if (allThingAlternateIds.includes(pmd.thingAlternateId)) {
        pmd.statusLog.push("DUPLICATE_ALTERNATE_ID");
        pmd.error= "Duplicate thing alternate id detected, handling unit "
          + "may contain more than one material and delivery";
        resolve(pmd);
      } else {
        allThingAlternateIds.push(pmd.thingAlternateId);
        // first look for thing type
        iotae.getThingType(token, thingType)
        .then(thingType => {
          pmd.statusLog.push("THING_TYPE_FOUND");
          // get sensor mapping id
          if (thingType.d.SensorTypeMappings.results.length === 1) {
            pmd.mappingId = thingType.d.SensorTypeMappings.results[0].MappingId;
            // find sensor associated with this handling unit
            return iotservice.getHandlingUnitSensor(materialDelivery.HandlingUnitId);
          } else if (thingType.d.SensorTypeMappings.results.length > 1) {
            throw new Error("Thing type has more than one sensor type mapping, cannot determine which mapping to use");
          } else {
            throw new Error("Thing type does not have any sensor type mappings");
          }
        })
        .then(sensor => {
          pmd.statusLog.push("SENSOR_FOUND");
          pmd.sensorId = sensor.id;
          return iotae.createThing(token, pmd);
        })
        .then(thing => {
          pmd.thingId = thing._id;
          return iotae.getSensorAssignment(token, pmd.sensorId);
        })
        .then(assignments => {
          return iotae.createOrUpdateAssignment(token, pmd, assignments);
        })
        .then(assignment => {
          pmd.assignmentId = assignment.id;
          return iotae.setBasicData(token, pmd);
        })
        .then(() =>
        {
          pmd.statusLog.push("BASIC_DATA_CREATED");
          pmd.statusLog.push("DONE");
          resolve(pmd);
        })
        .catch(error => {
          pmd.statusLog.push("ERROR");
          pmd.error = error.stack;
          // some thing api error responses contain more info
          if (error.response && error.response.data && error.response.data.message) {
            pmd.errorMessage = error.response.data.message;
          } else if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
            pmd.errorMessage = error.response.data.error.message;
          }
          if (error.response && error.response.data && error.response.data.causes) {
            pmd.errorCauses = error.response.data.causes;
          }
          console.error(error);
          resolve(pmd);
        });
      }
    });
  }

  /**
   * Create the processed material delivery structure
   *
   * @returns Processed Material Delivery object, used as pmd throughout
   */
  static createProcessedMaterialDelivery(packageName, thingType, materialDelivery) {
    var thingDescription = "Handling Unit " + materialDelivery.HandlingUnitId + " for Material Type "
      + materialDelivery.MaterialType;
    var thingAlternateId = iotae.createThingAlternateId(materialDelivery);
    return {
      statusLog: ["STARTED"],
      packageName: packageName,
      thingType: thingType,
      thingName: thingAlternateId,
      thingDescription: thingDescription,
      thingAlternateId: thingAlternateId,
      materialDelivery: materialDelivery
    };
  }

  /**
   * Get a thing type with the provided thing type name
   *
   * @returns Promise that resolves with corresponding thing type parameter
   */
  static getThingType(token, thingType) {
    return new Promise(function(resolve, reject) {
      var thingTypeUrl = iotae.iotAEConfig()["config-thing-sap"] + "/ThingConfiguration/v2/ThingTypes('" + thingType + "')?$format=json&$expand=SensorTypeMappings/MeasureMappings,SensorTypeMappings/TargetMappings";

      var start = new Date();
      axios.get(thingTypeUrl, { "headers": { "Authorization": "Bearer " +  token} })
      .then(response => {
        console.info("getThingType: " + thingTypeUrl + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve(response.data);
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Get sensor assignments for a particular sensorId
   *
   * @returns Promise that resolves with an array of sensor assignments parameter
   */
  static getSensorAssignment(token, sensorId) {
    return new Promise(function(resolve, reject) {
      var url = iotae.iotAEConfig().endpoints["tm-data-mapping"] + "/v1/Assignments?sensorId=" + sensorId;

      var start = new Date();
      axios.get(url, { "headers": { "Authorization": "Bearer " +  token} })
      .then(response => {
        console.info("getSensorAssignment: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve(response.data);
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Delete a thing by thingId
   *
   * @returns Promise that resolves with no parameters
   */
  static deleteThing(token, thingId) {
    return new Promise(function(resolve, reject) {
      var url = iotae.iotAEConfig().endpoints["appiot-mds"] + "/Things('" + thingId + "')";

      var start = new Date();
      axios.delete(url, { "headers": { "Authorization": "Bearer " +  token} })
      .then(response => {
        console.info("deleteThing: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve();
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Create a thing  based on the processed material delivery structure.  Will
   * only create a Thing if one does not already exist with the same thing
   * alternate id.
   *
   * @returns Promise that resolves with the created or already existing thing parameter
   */
  static createThing(token, pmd) {
    return new Promise(function(resolve, reject) {

      var ioTIntegrationConfig = JSON.parse(process.env.IoTIntegration);
      var url = iotae.iotAEConfig().endpoints["appiot-mds"] + "/Things";

      iotae.getThingByAlternateId(token, pmd)
      .then(thing => {
        // thing already exists, return it
        pmd.statusLog.push("THING_FOUND");
        resolve(thing);
      })
      .catch(error => { // thing doesn't exist, we can create it
        var thingPayload = {
          "_externalId": pmd.thingAlternateId,
          "_alternateId": pmd.thingAlternateId,
          "_name": pmd.thingName,
          "_description": {
            "en": pmd.thingDescription
          },
          "_thingType": [
            pmd.thingType
          ],
          "_objectGroup": ioTIntegrationConfig.objectGroup
        };
        var start = new Date();
        axios.post(url, thingPayload, { "headers": { "Authorization": "Bearer " +  token} })
        .then(response => {
          console.info("createThing: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
          pmd.statusLog.push("THING_CREATED");
          return iotae.getThingByAlternateId(token, pmd);
        })
        .then(thing => {
          resolve(thing);
        })
        .catch(error => {
          reject(error);
        });
      });
    });
  }

  /**
   * Get a thing by alternate id
   *
   * @returns Promise that resolves with corresponding thing parameter, or rejects if not found (404)
   */
  static getThingByAlternateId(token, pmd) {
    return new Promise(function(resolve, reject) {

      var ioTIntegrationConfig = JSON.parse(process.env.IoTIntegration);
      var url = url =  iotae.iotAEConfig().endpoints["appiot-mds"] + "/ThingsByAlternateId('" + pmd.thingAlternateId + "')";

      var start = new Date();
      axios.get(url, { "headers": { "Authorization": "Bearer " +  token} })
      .then(response => {
        console.info("getThing: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve(response.data);
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Get all the things with the corresponding thing alternate it
   *
   * @returns Promise that resolves with array of corresponding things parameter
   */
  static getAllThingsByAlternateId(token) {
    return new Promise(function(resolve, reject) {

      var ioTIntegrationConfig = JSON.parse(process.env.IoTIntegration);
      var url = url =  iotae.iotAEConfig().endpoints["appiot-mds"] + "/Things?$filter=startswith(_alternateId,'MaterialT')";

      var start = new Date();
      axios.get(url, { "headers": { "Authorization": "Bearer " +  token} })
      .then(response => {
        console.info("getAllThingsByAlternateId: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve(response.data.value);
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Create or update assighment for processed material delivery structure.
   * Assighment will first be deleted if sensor is already assigned to another
   * thing.  Assignment will only be created if it does not already exist.
   *
   * @returns Promise that resolves with new or already existing assigment parameter
   */
  static createOrUpdateAssignment(token, pmd, assignments) {
    return new Promise(function(resolve, reject) {
      if (assignments.length > 0) {
        pmd.statusLog.push("ASSIGNMENT_FOUND");
        if (pmd.thingId !== assignments[0].thingId) {
          iotae.deleteAssignment(token, assignments[0].id)
          .then(() => {
            pmd.statusLog.push("ASSIGNMENT_DELETED");
            iotae.createAssignment(token, pmd)
            .then(assignment => { resolve(assignment); })
            .catch(error => { reject(error); });
          })
          .catch(error => { reject(error); });
        } else {
          pmd.statusLog.push("ASSIGNMENT_NOT_CHANGED");
          resolve(assignments[0]);
        }
      } else {
        iotae.createAssignment(token, pmd)
        .then(assignment => {
          pmd.statusLog.push("ASSIGNMENT_CREATED");
          resolve(assignment);
        })
        .catch(error => { reject(error); });
      }
    });
  }

  /**
   * Delete an assignment
   *
   * @returns Promise that resolves with no parameters
   */
  static deleteAssignment(token, assignmentId) {
    return new Promise(function(resolve, reject) {
      var url = iotae.iotAEConfig().endpoints["tm-data-mapping"] + "/v1/Assignments/" + assignmentId;
      var start = new Date();
      axios.delete(url, { "headers": { "Authorization": "Bearer " +  token, "If-Match": "*" }})
      .then(response => {
        console.info("deleteAssignment: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve();
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Create an assigment for the processed material delivery structure
   *
   * @returns Promise that resolve with new assignment parameter
   */
  static createAssignment(token, pmd) {
    return new Promise(function(resolve, reject) {
      var url = iotae.iotAEConfig().endpoints["tm-data-mapping"] + "/v1/Assignments";
      var assignmentPayload = [
        {
          "thingId": pmd.thingId,
          "sensorIds": [
            pmd.sensorId
          ],
          "mappingId": pmd.mappingId
        }
      ];
      var start = new Date();
      axios.post(url, assignmentPayload, { "headers": { "Authorization": "Bearer " +  token} })
      .then(response => {
        console.info("createAssignment: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve(response.data);
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Set basic data for the processed material delivery
   *
   * @returns Promise that resolves with no parameters
   */
  static setBasicData(token, pmd) {
    return new Promise(function(resolve, reject) {
      var ioTIntegrationConfig = JSON.parse(process.env.IoTIntegration);
      var url = iotae.iotAEConfig().endpoints["appiot-mds"] + "/Things('" + pmd.thingId + "')/" + pmd.thingType + "/" + ioTIntegrationConfig.basicPropertySet;
      var payload = {
        "value": [
          extend({
            HandlingUnitId: pmd.materialDelivery.HandlingUnitId,
            MaterialType: pmd.materialDelivery.MaterialType,
            MaterialNumber: pmd.materialDelivery.MaterialNumber
          }, pmd.materialDelivery.basicData)
        ]
      };
      var start = new Date();
      axios.put(url, payload, { "headers": { "Authorization": "Bearer " +  token} })
      .then(response => {
        console.info("setBasicData: " + url + " " + (new Date().getTime()-start.getTime()) + "ms");
        resolve(response.data);
      })
      .catch(error => {
        reject(error);
      });
    });
  }

  /**
   * Create the thing alternate id for the material delivery
   */
  static createThingAlternateId(materialDelivery) {
      // MaterialT_<MATERIAL_TYPE>_<HUID>
      return "MaterialT_" + materialDelivery.MaterialType +
        "_" + materialDelivery.HandlingUnitId;

  }
}
module.exports = iotae;

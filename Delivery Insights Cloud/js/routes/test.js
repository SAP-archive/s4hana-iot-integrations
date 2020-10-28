var express = require("express");
var router = express.Router();
var iotae = require("../util/iotae");
var jobscheduler = require("../util/jobscheduler");
var s4 = require("../util/s4");

router.get("/test/handlingUnitByTimestamp", function (req, res) {
  var ts = 20190915140101;
  s4.getHandlingUnitByTimestamp(ts)
    .then((response) => {
      res.json(response.data);
    })
    .catch((error) => {
      res.json(error);
    });
});

router.get("/test/getDeliveryByIdList", function (req, res) {
  var ts = 20190915140101;
  s4.getHandlingUnitByTimestamp(ts)
    .then((response) => {
      var huList = response.data.d.results;

      // extract the delivery id from the response
      var dIdList = [];
      for(var i=0; i<huList.length; i++) {
        dIdList.push(huList[i].HandlingUnitReferenceDocument); // HandlingUnitReferenceDocument of a Handling Unit is the Delivery Id
      }

      // Get the delivery details
      s4.getDeliveriesByIdList(dIdList)
        .then((dList) => {
          console.log("huList:");
          console.log(huList);
          console.log("dList:");
          console.log(dList);

          res.json(dList);
        })
        .catch((error) => {
          res.json(error);
        });
    })
    .catch((error) => {
      res.json(error);
    });
});

router.get("/test/getBpByIdList", function (req, res) {
  var ts = 20190915140101;
  s4.getHandlingUnitByTimestamp(ts)
    .then((response) => {
      var huList = response.data.d.results;

      // extract the delivery id from the response
      var dIdList = [];
      for(var i=0; i<huList.length; i++) {
        dIdList.push(huList[i].HandlingUnitReferenceDocument); // HandlingUnitReferenceDocument of a Handling Unit is the Delivery Id
      }

      // Get the delivery details
      s4.getDeliveriesByIdList(dIdList)
        .then((dList) => {
          // extract the business partner id from the response
          var bpIdList = [];
          for(var i=0; i<dList.length; i++) {
            bpIdList.push(dList[i].ShipToParty); // ShipToParty of a Delivery is the Business Partner Id
          }

          // Get the business partner details
          s4.getBusinessPartnerByIdList(bpIdList)
            .then((bpList) => {
              console.log("huList:");
              console.log(huList);
              console.log("dList:");
              console.log(dList);
              console.log("bpList:");
              console.log(bpList);

              res.json(bpList);
            })
            .catch((error) => {
              res.json(error);
            });
        })
        .catch((error) => {
          res.json(error);
        });
    })
    .catch((error) => {
      res.json(error);
    });
});

router.get("/test/getMaterialDeliveries", function (req, res) {
  var ts = 20190915140101;
  s4.getMaterialDeliveries(ts)
    .then((materialDeliveries) => {
      res.json(materialDeliveries);
    })
    .catch((error) => {
      res.json(error);
    });
});

router.get("/test/process", function (req, res) {
  var sync = req.query.sync;
  var jobId = req.header("x-sap-job-id");
  var scheduleId = req.header("x-sap-job-schedule-id");
  var runId = req.header("x-sap-job-run-id");
  var schedulerHost = req.header("x-sap-scheduler-host");
  if (sync === "true") {
    iotae.processLocal(req)
    .then((processedMaterialDeliveries) => {
        res.json(processedMaterialDeliveries);
    })
    .catch((error) => {
      res.status(500).json({error: error.message}, null, 4);
    });
  } else {
    // async, i.e. job scheduler
    iotae.processLocal(req)
    .then((processedMaterialDeliveries) => {
      // log async result with job scheduler values
      var asyncLogResult = {
        jobId: jobId,
        runId: runId,
        scheduleId: scheduleId,
        processedMaterialDeliveries: processedMaterialDeliveries
      };
      console.log(JSON.stringify(asyncLogResult));
      var jobRunMessage = "Processed "  + processedMaterialDeliveries.numberProcessed + " deliveries "
        + "in " + processedMaterialDeliveries.durationMs/1000 + " seconds for jobId " + jobId;
      if (processedMaterialDeliveries.errorFound) {
        jobRunMessage += ", one or more errors found, see integration app log for more details";
      }
      return jobscheduler.updateJobRunLog(req, jobId, scheduleId, runId, true,jobRunMessage);
    })
    .then(() => {
      console.info("Job scheduler updated for jobId " + jobId + " scheduleId " + scheduleId + " runId " + runId);
    })
    .catch(error => {
      console.error(error);
      jobscheduler.updateJobRunLog(req, jobId, scheduleId, runId, false, error.message)
      .catch(error => {
        console.error(error);
      });
    });
    // respond with 202 while async process runs
    res.status(202).send();
  }
});
module.exports = router;

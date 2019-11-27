var express = require("express");
var router = express.Router();
var iotae = require("../util/iotae");
var jobscheduler = require("../util/jobscheduler");
var s4 = require("../util/s4");

router.post("/process", function (req, res) {
  var sync = req.query.sync;
  var jobId = req.header("x-sap-job-id");
  var scheduleId = req.header("x-sap-job-schedule-id");
  var runId = req.header("x-sap-job-run-id");
  var schedulerHost = req.header("x-sap-scheduler-host");
  if (sync === "true") {
    iotae.processS4(req)
    .then((processedMaterialDeliveries) => {
        res.json(processedMaterialDeliveries);
    })
    .catch((error) => {
      res.status(500).json({error: error.message}, null, 4);
    });
  } else {
    // async, i.e. job scheduler
    iotae.processS4(req)
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

router.delete("/things", function (req, res) {
  iotae.deleteThings(req)
  .then(() => {
    res.status(200).send();
  })
  .catch(error => {
    res.status(500).json({error: error.message}, null, 4);
  });
});
module.exports = router;

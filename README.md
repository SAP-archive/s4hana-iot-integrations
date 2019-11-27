# IoT Reference Application for S/4 HANA Cloud

## Description

This iot sample application is meant to make it simpler for you to build your
own iot application that will synchronize relevant S/4 HANA Cloud Delivery and
Material data into your Leonardo IoT environment.

It features the use of SAP Cloud Platform IoT, Leonardo IoT and a NodeJS application
for synchronizing relevant data to cloud foundry.

## Requirements
* [NodeJS](https://nodejs.org/en/download/) (we used v11.12.0)
* [SAP Cloud Platform Account](https://cloudplatform.sap.com/index.html) with a cloud foundry sub-account
* [SAP Cloud Identity tenant](https://cloudplatform.sap.com/capabilities/product-info.SAP-Cloud-Platform-Identity-Authentication.06dbcc67-ab2a-4d2e-aff1-28dfaaf95063.html)  **This is a commercial paid product**
* [A subscription to SAP Leonardo IoT](https://www.sap.com/products/leonardo-iot-data-services.html) and a service instance of [SAP Leonardo IoT for cloud foundry](https://help.sap.com/viewer/2f1daa938df84fd090fa2a4da6e4bc05/Cloud/en-US).  **These are commercial paid products**
* [A subscription to SAP Cloud Platform Internet of Things](https://www.sap.com/products/iot-platform-cloud.html) **This is a commercial paid product**
* [An instance of SAP Cloud Platform Job Scheduler](https://www.sap.com/products/cloud-platform/capabilities/foundation.html#job-scheduler) **This is a commercial paid product**
* [Cloud Foundry Command Line Interface (CLI)](https://developers.sap.com/tutorials/cp-cf-download-cli.html) installed on your system

## Download and Installation
Click on the `Clone or download` button to download as a zip, or [clone the repository](https://help.github.com/articles/cloning-a-repository/) on your desktop.

Instructions on how to configure and deploy the sample application will be
covered later in the [In IoT Integration Application](#in-iot-integration-application)
configuration section since it depends on some initial configuration to be
performed in SAP Leonardo IoT.

## Configuration
A basic understanding of SAP Cloud Platform Internet of Things device modeling
and SAP Leonardo IoT thing modeling is needed to perform the following configuration
steps.  The following two tutorials on [developers.sap.com](https://developers.sap.com/) provide a good overview
of device and thing modeling:
- [Create a Simple IoT Device Model](https://developers.sap.com/tutorials/iot-express-2-create-device-model.html)
- [Create a Thing Model and Bind to Device](https://developers.sap.com/tutorials/iot-express-4-create-thing-model.html)

### The following configuration parameters will be required
| Parameter | Description |
|-----------|-------------|
| IoTIntegration > package | Leonardo IoT fully qualified package name that you will create during Leonardo IoT Configuration, e.g. `{tenant subdomain}.humaterial`. Use the Leonardo IoT Services package API to query the details of your package. |
| IoTIntegration > basicPropertySet | Leonardo IoT basic property set name that you will create during Leonardo IoT Configuration, e.g. `humaterialbasic`. |
| IoTIntegration > objectGroup | Leonardo IoT authorization object group, e.g. `E2328EA3DFFA45BBA577AF4C2084A904`. Use the Leonardo IoT Services authorization API to query the details of your object group. |
| S4 > url | The base url to your S/4 service.  This should be an S/4 HANA Cloud Service. E.g. `https://myXXXXXX.s4hana.ondemand.com`. |
| S4 > username | The Basic Authentication user name for your S/4 service. |
| S4 > password | The Basic Authentication user password for your S/4 service. |
| IoTService | Obtain the `instanceId`, `cockpitUrl`, `username` and `password` from the SCP Cockpit IoT Service Instance Key.  The `apiUrl` is the `cockpitUrl` with the `/iot/cockpit` path removed, e.g. `https://{instanceId}.eu10.cp.iot.sap/{instanceId}`. |
| HANDLING_UNIT_ID | For each Handling Unit Id that will be used in a delivery. Use the S/4 OData service for a handling unit: `API_HANDLING_UNIT: HandlingUnit/HandlingUnitExternalID`. |
| MATERIAL_TYPE | For each Material Type/Group that you want to synchronize to IoT. Use the S/4 OData service for a delivery: `API_OUTBOUND_DELIVERY_SRV: A_OutbDeliveryHeader/to_DeliveryDocumentItem/MaterialGroup`. |

### In SAP Cloud Platform Internet of Things
Make sure Message Processing Configuration has been
configured (Configuration and Selector) before creating your device model to
ensure device metadata is available in SAP Leonardo IoT.

1. Create a `Capability` with the measures of your choice, e.g. `Temperature`
2. Create a `Sensor Type` with the above `Capability`
3. Create a `Device` and add a `Sensor` with naming convention `HUMaterial_{HANDLING_UNIT_ID}` for
each handling unit device that will be used for material deliveries

  > Note: The `Sensor` naming convention must be strictly followed, this is how the
  delivery with a particular handling unit and sensor is determined

### In SAP Leonardo IoT
1. Create a Leonardo IoT Package, note the package name
  - You'll need the fully qualified package name, you can obtain it using the
  SAP Leonardo IoT Services APIs for reading packages
2. Create a `Measured Values` property set in your new package with
corresponding properties matching your above `Capability`, e.g. `Temperature`
3. Create a `Basic Data` property set in your new package with the following
properties of type `string`
  - These are required properties:
    - HandlingUnitId
    - MaterialType
    - MaterialNumber
  - These properties can be modified by editing the JavaScript code in [s4.js](js/util/s4.js):
    - PurchaseOrder
    - DeliveryItemText
    - SalesOrder
    - SalesOrderItem
    - PackagingMaterial
    - Delivery
    - DeliveryItem
    - SoldToPartyName
    - Quantity
    - QuantityUnit
    - ContactEmail
    - NetAmount
    - NetAmountCurrency

> Note: The properties must exactly match what is generated by [s4.js](js/util/s4.js)

4. Create a `Thing Type` with naming convention `MaterialT_{MATERIAL_TYPE}` for
each S/4 Material Type that you want to be synchronized, add property sets you
created earlier

> Note: The `Thing Type` naming convention must be strictly followed, this is how the
thing type for a particular material type is determined

5. Map `Thing Type` to the `Sensor Type` you created in SAP Cloud Platform
Internet of Things through the `Connectivity` tab

### In IoT Integration Application
1. In your cloned or downloaded repository configure `{CUSTOMER_TENANT}` placeholder
variables in [xs-security.json](xs-security.json) and [manifest.yml](manifest.yml)
2. Create an XSUAA service instance with `xs-security.json` by running the following command
    - `cf cs xsuaa application {SERVICE_NAME} -c xs-security.json`
3. Configure all placeholder variables in curly braces, e.g. `{PACKAGE_NAME}`
in the [manifest.yml](manifest.yml) before deploying
it to SAP Cloud Platform.  Refer to the environment variable section under
`env`.  You'll need to have your S/4 HANA and SAP Cloud Platform Internet of
Things service credentials, and service instance names available.

> Note: You may need to use the SAP Leonardo IoT Services APIs to obtain some of
the configuration values such as package, basicPropertySet and objectGroup.  See
the SAP Leonardo IoT Services documentation for more information.

### Deployment

1. Use `cf` CLI to log into your CF sub account and space where the Leonardo IoT,
XSUAA and Job Scheduler service instances have been created
2. From the root folder of this sample application execute `cf push`
3. Note the sample integration app urls displayed in the console at the end of
the deployment, you'll use this url for testing and to configure the Job
Scheduler.

### Test
You can use Postman to synchronously invoke the process endpoint via `POST` to
`{IOT_INTEGRATION_APP_URL}/process?sync=true`, note that you must provide
a client credential based OAuth Bearer token obtained from the `XSUAA` credentials
from the application binding, e.g.

`POST https://mytenant-iot-integration-svc.cfapps.eu10.hana.ondemand.com/process?sync=true`

### Configure Job Scheduler
Make sure the JobScheduler service is created with enable-xsuaa-support parameter, e.g.
`cf create-service jobscheduler standard jobscheduler -c '{"enable-xsuaa-support":true}'`

1. Log into the Job Scheduler Dashboard from the service instance in SAP Cloud
Platform
2. Create a job with `Target Application` set to `iot-integration-svc`,
`HTTP Method` set to `POST` and `Action`
set to `{IOT_INTEGRATION_APP_URL}/process`, e.g.
  `https://mytenant-iot-integration-svc.cfapps.eu10.hana.ondemand.com/process`
3. Create a schedule for this job with your desired frequency.  The job process
will run asynchronously and the schedule log can be checked for the result of
the process.

## Limitations
- Sample app only synchronizes Delivery and Material data from S/4 HANA Cloud
- SAP Cloud Platform IoT device model and Leonardo IoT model must be created
manually through configuration UI, only Things are automatically created
- S/4 HANA Cloud Deliveries must contain only one Material at a time
- Only Basic Authentication is supported with SAP Cloud Platform IoT and
S/4 HANA Cloud connectivity
- In case a delivery is deleted or cancelled, it is expected that the Thing
will be deleted manually
- The following S4 OData services will be used to fetch HU/Deliveries
  - API_HANLDING_UNIT
  - API_OUTBOUND_DELIVERY_SRV

## Support
Please check the Leonardo IoT or SAP Cloud Platform IoT topic at http://answers.sap.com for answers or to ask a new question relative to this sample application and relative to the products used. You might be referred to other support forums and channels from there.

## License
Copyright (c) 2019 SAP SE or an SAP affiliate company. All rights reserved.
This file is licensed under the Apache Software License, v. 2 except as noted otherwise in the [LICENSE file](/LICENSE)

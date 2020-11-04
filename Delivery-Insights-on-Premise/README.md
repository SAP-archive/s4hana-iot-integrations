# IoT Reference Application for SAP S/4 HANA On-Premise

## Description

This iot sample application is meant to make it simpler for you to build your
own iot application that will synchronize relevant SAP S/4HANA On-Premise Delivery and
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
* [An instance of SAP Cloud Platform Destination Service](https://help.sap.com/viewer/cca91383641e40ffbe03bdc78f00f681/Cloud/en-US/9fdad3cad92e4b63b73d5772014b380e.html) **This is a commercial paid product**
* [SAP Cloud Connector](https://help.sap.com/viewer/cca91383641e40ffbe03bdc78f00f681/Cloud/en-US/e6c7616abb5710148cfcf3e75d96d596.html) **This is a commercial paid product**
* [An instance of SAP Cloud Platform Connectivity Service](https://help.sap.com/viewer/cca91383641e40ffbe03bdc78f00f681/Cloud/en-US/a2b88cf9d41e4061bfb06a23d9ba1c43.html) **This is a commercial paid product**
* [Cloud Foundry Command Line Interface (CLI)](https://developers.sap.com/tutorials/cp-cf-download-cli.html) installed on your system
* [Configure the Connected System – S/4HANA On-premise](https://help.sap.com/viewer/DRAFT/e6ca05f54f6546aa38ab5078ce00be5f/2020_DEV/en-US/41d160876cae4459acd5c7ef5691498a.html) **Required to enable odata calls for SAP S/4HANA on-premise system**

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
- [Configure Destination for SAP S/4HANA On-Premise System](https://help.sap.com/viewer/0e4dd38c4e204f47b1ffd09e5684537b/Cloud/en-US/95f1148f32274c6ba548ddd3014d5d5d.html)
- [Enable the path for above created destination in cloud connector](https://help.sap.com/viewer/cca91383641e40ffbe03bdc78f00f681/Cloud/en-US/db9170a7d97610148537d5a84bf79ba2.html) 

### The following configuration parameters will be required
| Parameter | Description |
|-----------|-------------|
| IoTIntegration > package | Leonardo IoT fully qualified package name that you will create during Leonardo IoT Configuration, e.g. `{tenant subdomain}.humaterial`. Use the Leonardo IoT Services package API to query the details of your package. |
| IoTIntegration > basicPropertySet | Leonardo IoT basic property set name that you will create during Leonardo IoT Configuration, e.g. `humaterialbasic`. |
| IoTIntegration > objectGroup | Leonardo IoT authorization object group, e.g. `E2328EA3DFFA45BBA577AF4C2084A904`. Use the Leonardo IoT Services authorization API to query the details of your object group. |
| S4 > url | The base url to your S/4 service.  This should be an S/4 HANA On-premise exposed odata api's. |
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
  - These properties can be modified by editing the JavaScript code in [s4op.js](js/util/s4op.js):
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

> Note: The properties must exactly match what is generated by [s4op.js](js/util/s4op.js)

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
    
3. Create a destination service instance with `xs-security.json` by running the following command
    - `cf cs destination <service-plan> {SERVICE_NAME} -c xs-security.json`
    
4. Create a connectivity service instance with `xs-security.json` by running the following command
    - `cf cs connectivity <service-plan> {SERVICE_NAME} -c xs-security.json`
    
5. Configure all placeholder variables in curly braces, e.g. `{PACKAGE_NAME}`
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
`{IOT_INTEGRATION_APP_URL}/op/process?sync=true&dest={your_destination_name}`, note that you must provide
a client credential based OAuth Bearer token obtained from the `XSUAA` credentials
from the application binding, e.g.

`POST https://mytenant-iot-integration-svc.cfapps.eu10.hana.ondemand.com/op/process?sync=true&dest={your_destination_name}`

### Configure Job Scheduler
Make sure the JobScheduler service is created with enable-xsuaa-support parameter, e.g.
`cf create-service jobscheduler standard jobscheduler -c '{"enable-xsuaa-support":true}'`

1. Log into the Job Scheduler Dashboard from the service instance in SAP Cloud
Platform
2. Create a job with `Target Application` set to `iot-integration-svc`,
`HTTP Method` set to `POST` and `Action`
set to `{IOT_INTEGRATION_APP_URL}/op/process?dest={your_destination_name}`, e.g.
  `https://mytenant-iot-integration-svc.cfapps.eu10.hana.ondemand.com/op/process?dest={your_destination_name}`
3. Create a schedule for this job with your desired frequency.  The job process
will run asynchronously and the schedule log can be checked for the result of
the process.

## Limitations
- Sample app only synchronizes Delivery and Material data and Sales Order Details from S/4 HANA On-Premise
- SAP Cloud Platform IoT device model and Leonardo IoT model must be created
manually through configuration UI, only Things are automatically created
- S/4 HANA On-premise Deliveries must contain only one Material at a time
- Deliveries should only contain one Sales Order Item (of this material) belonging to one Sales Order
- Only Basic Authentication is supported with SAP Cloud Platform IoT and
S/4 HANA On-Premise connectivity
- In case a delivery is deleted or cancelled, it is expected that the Thing
will be deleted manually
- The following S4 OData services will be used to fetch HU/Deliveries
  - API_HANLDING_UNIT - Custom BAPI exposed as odata service from S4 on-premise system as per instructions in requirements section
  - API_OUTBOUND_DELIVERY_SRV - Custom BAPI exposed as odata service from S4 on-premise system as per instructions in requirements section

## Support
Please check the Leonardo IoT or SAP Cloud Platform IoT topic at http://answers.sap.com for answers or to ask a new question relative to this sample application and relative to the products used. You might be referred to other support forums and channels from there.

## License
Copyright (c) 2019 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE file](/LICENSE)

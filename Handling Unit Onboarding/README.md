Readme
# IoT Handling Unit Mapping Application (HUM) for SAP S/4 HANA Cloud

## Description
This IoT sample application is designed to simplify the process of adding and updating mappings between handling units and SAP IoT sensors and enables fast processing. By supporting barcode scanners in mobile applications and search helps, desired combinations can be found and added quickly.

## Requirements
* [SAP Cloud Platform Account](https://cloudplatform.sap.com/index.html) with a cloud foundry sub-account
* [SAP Cloud Identity tenant](https://cloudplatform.sap.com/capabilities/product-info.SAP-Cloud-Platform-Identity-Authentication.06dbcc67-ab2a-4d2e-aff1-28dfaaf95063.html)  **This is a commercial paid product**
* [A subscription to SAP IoT](https://www.sap.com/products/leonardo-iot-data-services.html) and a service instance of [SAP Leonardo IoT for cloud foundry](https://help.sap.com/viewer/2f1daa938df84fd090fa2a4da6e4bc05/Cloud/en-US).  **These are commercial paid products**
* [A subscription to SAP Cloud Platform Internet of Things](https://www.sap.com/products/iot-platform-cloud.html) **This is a commercial paid product**
* [Cloud Foundry Command Line Interface (CLI)](https://developers.sap.com/tutorials/cp-cf-download-cli.html) installed on your system

## Download and Installation
Click on the `Clone or download` button to download as a zip, or [clone the repository](https://help.github.com/articles/cloning-a-repository/) on your desktop.

Instructions on how to configure and deploy the sample application will be
covered later in the [In IoT HUM Application](#in-iot-hum-application)
configuration section since it depends on some initial configuration to be
performed in SAP IoT.

## Configuration
A basic understanding of SAP Cloud Platform Internet of Things device modeling
and SAP IoT thing modeling is needed to perform the following configuration
steps.  The following two tutorials on [developers.sap.com](https://developers.sap.com/) provide a good overview
of device and thing modeling:
- [Create a Simple IoT Device Model](https://developers.sap.com/tutorials/iot-express-2-create-device-model.html)
- [Create a Thing Model and Bind to Device](https://developers.sap.com/tutorials/iot-express-4-create-thing-model.html)

### The following configuration parameters will be required
| Parameter | Description |
|-----------|-------------|
| HUM > prefix_HU | Prefix for name / ID of the generated thing. Inserts the prefix automatically when the thing is created. Can also be "". |
| HUM > suffix_HU | Suffix for name / ID of the generated thing. Inserts the prefix automatically when the thing is created. Can also be "". |
| HUM > prefix_BarCode | Prefix for barcode. Adds the desired prefix when scanning a barcode. Can also be "". |
| HUM > suffix_BarCode | Suffix for barcode. Adds the desired prefix when scanning a barcode. Can also be "". |
| HUM > barcodeType | Specifies the desired barcode formatting, e.g. `code_128_reader`. Examples can be found on the website of the implemented open source project [QuaggaJS](https://serratus.github.io/quaggaJS/#decoder). |
| HUM > mapping_id | Mapping ID of the desired mapping template. See [In HUM Application](#in-hum-application). |
| HUM > _thingType | Full name of the created Thing Type, e.g. `iot.s4int.{package}:{thing type}`. See [In HUM APP](#in-hum-application). |
| HUM > _ objectGroup | IoT authorization object group, e.g. `E2328EA3DFFA45BBA577AF4C2084A904`. Use the IoT Services authorization API to query the details of your object group. |
| HUM > warehouse | Warehouse ID of the handling units. |

### In SAP Cloud Platform Internet of Things
Make sure Message Processing Configuration has been
configured (Configuration and Selector) before creating your device model to
ensure device metadata is available in SAP Leonardo IoT.

1. Create a `Capability` with the measures of your choice, e.g. `Temperature`
2. Create a `Sensor Type` with the above `Capability`
3. Create a `Device` and add a `Sensor` with naming convention.

### In SAP IoT
1. Create a IoT Package, note the package name
  - You'll need the fully qualified package name, you can obtain it using the
  SAP IoT Services APIs for reading packages
2. Create a `Measured Values` property set in your new package with
corresponding properties matching your above `Capability`, e.g. `Temperature`
3. Create a `Basic Data` property set in your new package with the 
Properties.
4. Create a `Thing Type` and add property sets you created earlier.
5. Map `Thing Type` to the `Sensor Type` you created in SAP Cloud Platform
Internet of Things through the `Connectivity` tab. 
6. Note Mapping ID & Thing Type ID

> Note: The created `Thing Type` will be used as `Thing Type Template` for your future mappings. 

### In HUM Application
Make sure that a destination is created between your development instance and the required systems.
1. In your cloned repository at deploymentParameters > DeploymentParameters.json please configure the parameters mentioned above.
> Note: You may need to use the SAP IoT Services APIs to obtain some of
the configuration values such as package, basicPropertySet and objectGroup. See
the SAP IoT Services documentation for more information.
2. Set up the correct destinations in the file ´manifest.json´. Substitute the placeholders ´{TenantID}´ for the ´uri´ of the following data sources with your tenants:
- SensorService
- SensorTypeService
- GatewayService
- DeviceService
3. Make sure that you have set up the service destinations of the data sources. Pay attention to the naming, which can be found in the file 'neo-app.json '.

### Deployment
1. Use `cf` CLI to log into your CF sub account and space where the IoT,
XSUAA and Job Scheduler service instances have been created
2. From the root folder of this sample application execuate `cf push`

### Test
To test the connections, use the field value helps and check your results. Also see check out the created ´Things´ at SAP IoT.

## Limitations
- It is only possible to use one bar code type at once, determined by the deployment parameters.
- It is only possible to use one warehouse at once, determined by the deployment parameters.
- This sample app is only used for Onboarding-Scenarios, which means to update and create mappings between handling units and SAP IoT sensors. Created Things and Mappings must be deleted manually.

## Support
Please check the IoT or SAP Cloud Platform IoT topic at http://answers.sap.com for answers or to ask a new question relative to this sample application and relative to the products used. You might be referred to other support forums and channels from there.

## Used Third Party Content
This sample app is using [QuaggaJS](https://serratus.github.io/quaggaJS/) implementations.

## License
Copyright (c) 2020 SAP SE or an SAP affiliate company. All rights reserved. This project is licensed under the Apache Software License, version 2.0 except as noted otherwise in the [LICENSE file](/LICENSE)

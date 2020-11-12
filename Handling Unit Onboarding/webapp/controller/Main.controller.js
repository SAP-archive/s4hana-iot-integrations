sap.ui.define(["sap/ui/core/mvc/Controller",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/m/Token",
	"sap/ui/core/MessageType",
	"sap/m/MessageItem",
	"sap/m/MessagePopover",
	"sap/m/MessageToast",
	"sap/m/ColumnListItem",
	"sap/ui/core/message/Message",
	"sap/m/Label",
	"sap/ui/core/Element",
	"sap/ui/core/message/ControlMessageProcessor",
	"sap/m/Dialog",
	"sap/m/DialogType",
	"sap/ui/core/ValueState",
	"sap/m/Button",
	"sap/m/ButtonType",
	"sap/m/Text"
], function (Controller, JSONModel, Filter, FilterOperator, Token, MessageType, MessageItem, MessagePopover, MessageToast,
	ColumnListItem, Message, Label, Element, ControlMessageProcessor, Dialog, DialogType, ValueState, Button, ButtonType, Text) {
	"use strict";
	/* global Quagga:true */

	return Controller.extend("HandlingUnitMappingApp.controller.Main", {
		onInit: function () {
			this.oMessageManager = sap.ui.getCore().getMessageManager();
			this.getView().setModel(this.oMessageManager.getMessageModel(), "messages");
			this.oMessageManager.registerObject(this.getView().byId("mappingList"), true);
			this.initListItemsModel();
			this.initIotSensorsModelNew();

			//add event listener for barcode input
			var oBarCodeData = {
				lastSelectedInputFieldForBarCode: ""
			};
			var oModel = new JSONModel(oBarCodeData);
			this.getView().setModel(oModel, "BarCodeData");

			var that = this;

			$("body").on("click", function (event) {

				var barCodeModel = that.getView().getModel("BarCodeData");

				if ($("#" + event.target.id).is("input") && $("#" + event.target.id).parent()
					.parent().hasClass(
						"preventBarCodeIdLost")) {

					barCodeModel.setProperty("/lastSelectedInputFieldForBarCode", event.target.id);
					that.getView().setModel(barCodeModel, "BarCodeData");

				} else if (event.target.id.indexOf("barCodeButtonId") > -1) {
					//do nothing if selecting barCode icon
				} else {
					barCodeModel.setProperty("/lastSelectedInputFieldForBarCode", "");
					that.getView().setModel(barCodeModel, "BarCodeData");
				}
			});
		},

		//initialize List Item Model
		initListItemsModel: function () {
			const oListItemsModel = this.getOwnerComponent().getModel("ListItemsModel");
			oListItemsModel.setData([]);
			this.getView().setModel(oListItemsModel, "ListItemsModel");
			this.addListItem();
			oListItemsModel.attachEvent("propertyChange", async(oEvent) => {
				const sPath = oEvent.getParameter("path");
				if (sPath === "sensor/alternateId") {
					await this.onSensorIdChange(oEvent.getParameter("value"), oEvent.getParameter("context").getPath());
				}
				if (sPath === "handlingUnit/handlingUnitId") {
					await this.onHandlingUnitIdChange(oEvent.getParameter("value"), oEvent.getParameter("context").getPath());
				}
				this.validateAllSensors();
				this.validateAllHandlingUnits();
			});
		},

		//event -> after sensor id change, resolve IoT sensor
		onSensorIdChange: function (sValue, sPath) {
			const oListItemsModel = this.getView().getModel("ListItemsModel");
			const oSensor = this.resolveIoTSensor(sValue);

			oListItemsModel.setProperty(`${sPath}/sensor`, oSensor);
		},

		//event -> after handling unit id change, resolve handling unit
		onHandlingUnitIdChange: async function (sValue, sPath) {
			const oListItemsModel = this.getView().getModel("ListItemsModel");

			await this.resolveHandlingUnit(sValue).then((oHandlingUnit) => {
				oListItemsModel.setProperty(`${sPath}/handlingUnit`, {
					handlingUnitId: oHandlingUnit.HandlingUnitExternalID || sValue,
					reference: oHandlingUnit.HandlingUnitReferenceDocument || "",
					materialType: oHandlingUnit.PackagingMaterialType || "",
					status: oHandlingUnit.HandlingUnitProcessStatus || "",
					material: oHandlingUnit.PackagingMaterial || "",
					created: oHandlingUnit.CreationDateTime || ""
				});
			});

			const oListData = oListItemsModel.getData();
			const oLastItem = oListData[oListData.length - 1];

			if (oLastItem !== null && oLastItem.handlingUnit.handlingUnitId.length > 0) {
				this.addListItem();
			}
		},

		//trigger sensor validation
		validateAllSensors: function () {
			const oListItemsModel = this.getOwnerComponent().getModel("ListItemsModel");

			for (const [index, oItem] of oListItemsModel.getData().entries()) {
				if (index < oListItemsModel.getData().length - 1) {
					this.validateSensor(oItem.sensor, `/${index}/sensor/alternateId`);
				}
			}
		},

		//trigger handling unit validation
		validateAllHandlingUnits: function () {
			const oListItemsModel = this.getOwnerComponent().getModel("ListItemsModel");

			for (const [index, oItem] of oListItemsModel.getData().entries()) {
				if (index < oListItemsModel.getData().length - 1) {
					this.validateHandlingUnit(oItem.handlingUnit, `/${index}/handlingUnit/handlingUnitId`);
				}
			}
		},

		//validate sensor
		validateSensor: function (oSensor, sPath) {
			this.removeMessagesByReference(sPath);
			const i18nResourceBundle = this.getView().getModel("i18n").getResourceBundle();
			/**
			 * Sensor empty or contains whitespace
			 **/
			if (this.isEmpty(oSensor.alternateId)) {
				this.oMessageManager.addMessages(
					new Message({
						message: i18nResourceBundle.getText("SensorMessageIDEmpty"),
						type: MessageType.Error,
						description: i18nResourceBundle.getText("SensorMessageIDEmptyDesc"),
						target: sPath,
						processor: this.getView().getModel("ListItemsModel")
					})
				);
				return false;
			}

			/**
			 * Sensor not found
			 **/
			if (this.isEmpty(oSensor.sensorId)) {
				this.oMessageManager.addMessages(
					new Message({
						message: i18nResourceBundle.getText("SensorMessageNotFound"),
						type: MessageType.Error,
						description: i18nResourceBundle.getText("SensorMessageNotFoundDesc", [oSensor.alternateId]),
						target: sPath,
						processor: this.getView().getModel("ListItemsModel")
					})
				);
				return false;
			}

			/**
			 *  SensorID duplicate
			 **/
			const aDuplicates = this.findDuplicateSensors(oSensor.alternateId);
			if (aDuplicates.length > 0) {
				this.oMessageManager.addMessages(
					new Message({
						message: i18nResourceBundle.getText("SensorMessageMultipleUse"),
						type: MessageType.Error,
						description: i18nResourceBundle.getText("SensorMessageMultipleUseDesc"),
						target: sPath,
						processor: this.getView().getModel("ListItemsModel")
					})
				);
				return false;
			}

			return true;
		},

		//validate handling unit
		validateHandlingUnit: function (oHu, sPath) {
			this.removeMessagesByReference(sPath);
			const i18nResourceBundle = this.getView().getModel("i18n").getResourceBundle();
			/**
			 * hu empty or contains whitespace
			 **/
			if (this.isEmpty(oHu.handlingUnitId)) {
				this.oMessageManager.addMessages(
					new Message({
						message: i18nResourceBundle.getText("HUmessageIDEmpty"),
						type: MessageType.Error,
						description: i18nResourceBundle.getText("HUmessageIDEmptyDesc"),
						target: sPath,
						processor: this.getView().getModel("ListItemsModel")
					})
				);
				return false;
			}
			/**
			 * Handling Unit not found
			 **/
			if (this.isEmpty(oHu.material)) {
				this.oMessageManager.addMessages(
					new Message({
						message: i18nResourceBundle.getText("HUmessageNotFound"),
						type: MessageType.Error,
						description: i18nResourceBundle.getText("HUmessageNotFoundDesc", [oHu.handlingUnitId]),
						target: sPath,
						processor: this.getView().getModel("ListItemsModel")
					})
				);

				return false;
			}

			/**
			 *  Handling Unit duplicate
			 **/
			const aDuplicates = this.findDuplicateHandlingUnit(oHu.handlingUnitId);
			if (aDuplicates.length > 0) {

				this.oMessageManager.addMessages(
					new Message({
						message: i18nResourceBundle.getText("HUmessageMultipleUse"),
						type: MessageType.Error,
						description: i18nResourceBundle.getText("HUmessageMultipleUseDesc"),
						target: sPath,
						processor: this.getView().getModel("ListItemsModel")
					})
				);
				return false;
			}

			return true;
		},

		//find duplicate sensors for validation
		findDuplicateSensors: function (sAlternateId) {
			const oListItemsModel = this.getOwnerComponent().getModel("ListItemsModel");
			const aDuplicates = [];

			for (const [index, oItem] of oListItemsModel.getData().entries()) {
				if (oItem.sensor.alternateId === sAlternateId) {
					aDuplicates.push(`/${index}/sensor/alternateId`);
				}
			}
			return aDuplicates.length > 1 ? aDuplicates : [];
		},

		//find duplicate handling unit for validation
		findDuplicateHandlingUnit: function (sHuId) {
			const oListItemsModel = this.getOwnerComponent().getModel("ListItemsModel");
			const aDuplicates = [];

			for (const [index, oItem] of oListItemsModel.getData().entries()) {
				if (oItem.handlingUnit.handlingUnitId === sHuId) {
					aDuplicates.push(`/${index}/handlingUnit/handlingUnitId`);
				}
			}
			return aDuplicates.length > 1 ? aDuplicates : [];
		},

		//delete solved error messages
		removeMessagesByReference: function (sRef) {
			this.oMessageManager.getMessageModel().getData().forEach(function (oMessage) {
				if (oMessage.target === null || oMessage.target === undefined) {
					return;
				} else if (oMessage.target.includes(sRef)) {
					this.oMessageManager.removeMessages(oMessage);
				}
			}.bind(this));
		},

		//util: format timestemp for IoT
		formatIotTimestamp: function (sDate) {
			if (sDate) {
				const dateFormat = sap.ui.core.format.DateFormat.getDateInstance({
					pattern: "dd.MM.YYYY HH:mm"
				});
				return dateFormat.format(new Date(sDate));
			}
			return "";
		},

		//util: format timestemp for handling unit
		formatHuTimestamp: function (sDate) {
			if (sDate) {
				const dateFormat = sap.ui.core.format.DateFormat.getDateTimeInstance({
					source: {
						pattern: "yyyyMMddmmHHss"
					},
					pattern: "dd.MM.YYYY HH:mm"
				});
				return dateFormat.format(dateFormat.parse(sDate));
			}

			return "";
		},

		//resolve IoT sensor
		resolveIoTSensor: function (sAlternateId) {
			const oIotSensorsData = this.getView().getModel("IoTSensorsModel").getData();
			return $.extend({
				alternateId: sAlternateId,
				sensorId: "",
				created: "",
				gateway: "",
				status: "",
				name: ""
			}, oIotSensorsData.find((sensor) => (sensor.alternateId === sAlternateId)));
		},

		//util: empty checker
		isEmpty: function (sString) {
			return (sString.length === 0 || !sString.trim());
		},

		//resolve Handling unit
		resolveHandlingUnit: function (sHandlingUnitId) {
			const oHuModel = this.getView().getModel("HandlingUnitsModel");
			var warehouse = this.getView().getModel("deploymentParametersModel").getProperty("/warehouse");

			return new Promise(function (resolve) {
				oHuModel.read(`/HandlingUnit(HandlingUnitExternalID='${sHandlingUnitId}',Warehouse='${warehouse}')`, {
					success: (oHandlingUnitResponse) => resolve(oHandlingUnitResponse),
					error: () => resolve({})
				});
			});
		},
		//util: read model of promise
		readModelPromise: function (oModel) {
			return new Promise((resolve, reject) => {
				oModel.attachRequestCompleted(function () {
					return resolve(this.getData());
				});
				oModel.attachRequestFailed(function () {
					return reject();
				});
			});
		},

		//initialize IoT sensor model
		initIotSensorsModelNew: async function () {
			const oIotSensorsModel = this.getOwnerComponent().getModel("IoTSensorsModel");

			var oSensorModel = this.getOwnerComponent().getModel("SensorsModel");
			var oGatewaysModel = this.getOwnerComponent().getModel("GatewaysModel");
			var oDeviceModel = this.getOwnerComponent().getModel("DevicesModel");
			//	var oSensorTypesModel = this.getOwnerComponent().getModel("SensorTypesModel");

			const oIotSensorsData = [];
			for (var i = 0; i < oSensorModel.getData().length; i++) {
				var oSensor = oSensorModel.getData()[i];
				var oDeviceData = oDeviceModel.getData();
				var oDevice = oDeviceData.find((device) => oSensor.deviceId === device.id);
				var oGateway = oGatewaysModel.getData().find((gateway) => oDevice.gatewayId);

				oIotSensorsData.push({
					name: oSensor.name,
					sensorId: oSensor.id,
					alternateId: oSensor.alternateId,
					created: oDevice.creationTimestamp,
					gateway: oGateway.name,
					status: oGateway.status
				});
			}
			oIotSensorsModel.setData(oIotSensorsData);

		},

		//event -> submit action
		submitAction: async function () {
			const oListItemsModel = this.getView().getModel("ListItemsModel");
			const oData = oListItemsModel.getData();
			const oMappingList = this.byId("mappingList");
			let aRequests = [];

			const oValidMappings = {};
			var oValidationResult = {
				"toUpdateMapping": undefined,
				"newMappings": undefined
			};

			oMappingList.setBusy(true);

			this.getView().setModel(new JSONModel(), "ThingsModel");

			for (const [index, oItem] of oData.entries()) {
				if (index < oData.length - 1) {
					const bValidSensor = this.validateSensor(oItem.sensor, `/${index}/sensor/alternateId`);
					const bValidHu = this.validateHandlingUnit(oItem.handlingUnit, `/${index}/handlingUnit/handlingUnitId`);
					if (bValidSensor && bValidHu) {
						oValidMappings[index] = oItem;
					}
				}
			}

			if (Object.keys(oValidMappings).length === 0 && oValidMappings.constructor === Object) {
				oMappingList.setBusy(false);
				return;
			}

			//Empty Error Log
			var oMessageManager = sap.ui.getCore().getMessageManager();
			oMessageManager.removeAllMessages();

			for (const oMapping of Object.values(oValidMappings)) {
				aRequests.push(this.createThing(oMapping));
			}

			oValidationResult = await this.checkExistingMappings(oValidMappings);
			Promise.all(aRequests).then((results) => {

				return this.updateOrCreateMappings(oValidationResult.toUpdateMapping, results);

			}).then((mappingsResult) => {

				//delete proceeded mappings from odata list
				for (var i = 0; i < oData.length; i++) {

					for (var k = 0; k < mappingsResult.aSucceededMappings.length; k++) {

						if (mappingsResult.aSucceededMappings[k].sensorIds.includes(oData[i].sensor.sensorId)) {
							oData.splice(i, 1);
						}
					}
				}

				oListItemsModel.refresh();
				oMappingList.setBusy(false);

				if (mappingsResult.aFailedMappings.length === 0) {
					MessageToast.show("Saving successful.");
				} else {
					const i18nResourceBundle = this.getView().getModel("i18n").getResourceBundle();
					this.openErrorMessageDialog(i18nResourceBundle.getText("SubmitWarningMappingFailed", [mappingsResult.aFailedMappings.length,
						mappingsResult.aSucceededMappings.length
					]));
				}
			});
		},

		//check for existing mappings
		checkExistingMappings: async function (oValidMappings) {

			var oValidationResult = {
				"toUpdateMapping": new Map(),
				"newMappings": []
			};

			//check every Mapping for existing
			for (var oMapping of Object.values(oValidMappings)) {
				console.log("oMapping: ", oMapping);
				var result = await this.callMappingserviceForCheck(oMapping.sensor.sensorId);

				if (result.mappingExisting) {

					var updateElement = {
						eTag: result.eTag,
						assignmentId: result.assignmentId,
						thingIdToDelete: result.thingId
					};
					oValidationResult.toUpdateMapping.set(oMapping.sensor.sensorId, updateElement);

				} else {
					oValidationResult.newMappings.push(oValidMappings);
				}
			}
			return oValidationResult;
		},

		//call mapping service for existing mappings check
		callMappingserviceForCheck: async function (sensorId) {

			return new Promise((resolve, reject) => {
				$.ajax({
					type: "GET",
					contentType: "application/json",
					url: "/mappingservice/v1/Assignments?sensorId=" + sensorId,
					success: function (data) {

						var result = {};

						if (data.length !== 0) {
							result.mappingExisting = true;
							result.eTag = data[0].ETag;
							result.assignmentId = data[0].id;

						} else {
							result.mappingExisting = false;
						}
						resolve(result);

					},
					error: function (oResponse, statustext, error) {
						//ErrorHandling here
						reject();
					}
				});
			});
		},

		//call service and create mappings
		createMappings: async function (aMappings) {

			return new Promise((resolve, reject) => {

				$.ajax({
					type: "POST",
					contentType: "application/json",
					url: "/mappingservice/v1/Assignments",
					data: JSON.stringify(aMappings),
					success: (response) => {
						resolve(true);
					},
					error: function (oResponse, statustext, error) {
						resolve(false);
					}
				});
			});
		},

		//call service and update mappings
		updateOrCreateMappings: async function (toUpdateMappingMap, createThingResults) {

			var oMappingResult = {
				"aSucceededMappings": [],
				"aFailedMappings": []
			};

			for (const updateElement of toUpdateMappingMap.values()) {
				await this.callMappingserviceForDelete(updateElement);
			}

			var mappingBulkResult = await this.createMappings(createThingResults);

			if (mappingBulkResult) {
				oMappingResult.aSucceededMappings = createThingResults;
			} else {
				//try again with single mapping calls
				oMappingResult = await this.proceedSingleMappings(createThingResults);
			}

			//delete obsolet Things after mapping failure
			for (var i = 0; i < oMappingResult.aFailedMappings.length; i++) {
				this.callThingServiceForDelete(oMappingResult.aFailedMappings[i].thingId);
			}

			return oMappingResult;
		},
		//call service and create single mapping
		proceedSingleMappings: async function (aMappings) {
			var oMappingResult = {
				"aSucceededMappings": [],
				"aFailedMappings": []
			};

			for (var i = 0; i < aMappings.length; i++) {
				var singleMappingResult = await this.createSingleMapping(aMappings[i]);

				if (singleMappingResult) {
					oMappingResult.aSucceededMappings.push(aMappings[i]);
				} else {
					oMappingResult.aFailedMappings.push(aMappings[i]);
				}
			}
			return oMappingResult;
		},

		//call service and create single mapping
		createSingleMapping: async function (singleMapping) {
			var that = this;

			return new Promise((resolve, reject) => {

				$.ajax({
					type: "POST",
					contentType: "application/json",
					url: "/mappingservice/v1/Assignments",
					data: JSON.stringify(singleMapping),
					success: (response) => {
						resolve(true);
					},
					error: function (oResponse, statustext, error) {

						that.addMessageToMessageManager(that.getView().getModel("i18n").getResourceBundle().getText("AjaxErrorCreateMapping") +
							": " + oResponse.responseJSON.message,
							sap.ui.core.MessageType.Error);
						resolve(false);
					}
				});
			});
		},

		//call service and delete thing with failed mapping
		callThingServiceForDelete: async function (thingId) {
			var that = this;
			return new Promise((resolve, reject) => {
				$.ajax({
					type: "DELETE",
					contentType: "application/json",
					url: "/thingservice/Things('" + thingId + "')",
					headers: {
						"If-Match": "*"
					},
					success: (response) => {
						resolve();
						//	console.log("thing " + thingId + " deleted");
					},
					error: (oResponse, statustext, error) => {
						that.addMessageToMessageManager(that.getView().getModel("i18n").getResourceBundle().getText("AjaxErrorDeleteThing") +
							thingId, sap.ui.core.MessageType.Error);
						reject();
					}
				});
			});
		},

		//call service and delete existing mappings
		callMappingserviceForDelete: async function (updateElement) {
			var that = this;
			return new Promise((resolve, reject) => {
				$.ajax({
					type: "DELETE",
					contentType: "application/json",
					url: "/mappingservice/v1/Assignments/" + updateElement.assignmentId,
					headers: {
						"If-Match": "*"
					},
					success: (response) => {
						resolve();
						//	console.log("mapping deleted");
					},
					error: (oResponse, statustext, error) => {
						that.addMessageToMessageManager(that.getView().getModel("i18n").getResourceBundle().getText("AjaxErrorCreateMapping"), sap.ui
							.core.MessageType.Error);
						reject();
					}
				});
			});
		},

		//call service and create thing
		createThing: function (oMapping) {
			var that = this;
			//get deployment paramters
			var oDeploymentParamersmodel = this.getView().getModel("deploymentParametersModel");

			const prefixHU = oDeploymentParamersmodel.getProperty("/prefix_HU");
			const suffixHU = oDeploymentParamersmodel.getProperty("/suffix_HU");
			const mappingID = oDeploymentParamersmodel.getProperty("/mapping_id");
			const _thingType = oDeploymentParamersmodel.getProperty("/_thingType");
			const _objectGroup = oDeploymentParamersmodel.getProperty("/_objectGroup");

			const sExternalId = `${prefixHU}${oMapping.handlingUnit.handlingUnitId}`;
			return new Promise((resolve, reject) => {

				$.ajax({
					type: "POST",
					contentType: "application/json",
					url: "/thingservice/Things",
					async: true,
					data: JSON.stringify({
						"_externalId": sExternalId,
						"_name": `${prefixHU}${oMapping.handlingUnit.handlingUnitId}${suffixHU}`, // deplyoment parameter prefix / suffix 
						"_description": {
							"en": `Handling Unit ${oMapping.handlingUnit.handlingUnitId}`
						},
						"_objectGroup": _objectGroup, // deplyoment parameter
						"_thingType": [_thingType] // deplyoment parameter 
					}),
					success: function (data, textStatus, request) {
						const sLocation = request.getResponseHeader("location");
						const sId = sLocation.substring(sLocation.indexOf("('") + 2, sLocation.indexOf("')"));
						resolve({
							thingId: sId,
							sensorIds: [oMapping.sensor.sensorId],
							mappingId: mappingID // deplyoment parameter
						});
					},
					error: function (jqXHR, textStatus, errorThrown) {
						that.addMessageToMessageManager(errorThrown, sap.ui.core.MessageType.Error);
						reject();
					}
				});
			});
		},

		//live search function
		liveSearch: function (evt) {
			const term = evt.getSource().getValue();
			const binding = this.byId("mappingList").getBinding("items");

			const filters = [
				new Filter("sensor/name", FilterOperator.Contains, term),
				new Filter("sensor/sensorId", FilterOperator.Contains, term),
				new Filter("sensor/alternateId", FilterOperator.Contains, term),
				new Filter("handlingUnit/handlingUnitId", FilterOperator.Contains, term)
			];
			const oFilter = new Filter({
				aFilters: filters,
				bAnd: false,
				_bMultiFilter: true
			});

			binding.filter(oFilter);
		},

		//remove items from the list
		removeListItem: function (oEvent) {
			const oBindingPath = oEvent.getSource().getBindingContext("ListItemsModel").getPath();
			const oModel = this.getView().getModel("ListItemsModel");
			const oData = oModel.getData();

			const index = oBindingPath.slice(oBindingPath.length - 1);
			oData.splice(index, 1);

			if (oData.length === 0) {
				this.addListItem();
			}

			this.getView().getModel("ListItemsModel").refresh(true);

			this.validateAllSensors();
			this.validateAllHandlingUnits();
		},

		//add element to list item
		addListItem: function () {
			const emptyListItem = {
				handlingUnit: {
					handlingUnitId: "",
					reference: "",
					created: "",
					status: "",
					material: "",
					materialType: ""
				},
				sensor: {
					name: "",
					sensorId: "",
					alternateId: "",
					created: "",
					gateway: "",
					status: ""
				}
			};
			const oModel = this.getView().getModel("ListItemsModel");
			const aData = oModel.getProperty("/");

			aData.push(emptyListItem);
			oModel.setProperty("/", aData);

			this.getView().getModel("ListItemsModel").refresh(true);

			this.validateAllSensors();
			this.validateAllHandlingUnits();
		},

		//event -> handle message popover press
		handleMessagePopoverPress: function (oEvent) {

			if (!this.oMP) {
				this.createMessagePopover();
			}
			this.oMP.toggle(oEvent.getSource());
		},

		//create message popover
		createMessagePopover: function () {
			const that = this;

			this.oMP = new MessagePopover({
				activeTitlePress: function (oEvent) {
					const oItem = oEvent.getParameter("item");
					const oPage = that.oView.byId("mainPage");
					const oMessage = oItem.getBindingContext("messages").getObject();
					const oControl = Element.registry.get(oMessage.getControlId());

					if (oControl) {
						oPage.scrollToElement(oControl.getDomRef(), 200, [0, -100]);
						setTimeout(function () {
							oControl.focus();
						}, 300);
					}
				},
				items: {
					path: "messages>/",
					template: new MessageItem({
						title: "{messages>message}",
						subtitle: "{messages>additionalText}",
						activeTitle: true,
						type: "{messages>type}",
						description: "{messages>description}"
					})
				},
				groupItems: false
			});

			this.getView().byId("messagePopoverBtn").addDependent(this.oMP);
		},

		/*
		 *  Handling Unit Value Help 
		 */
		onHuValueHelpRequested: function (oEvent) {
			this.huValueHelpUserInput = oEvent.getSource();
			const i18nResourceBundle = this.getView().getModel("i18n").getResourceBundle();

			const oHuHelpColModel = new sap.ui.model.json.JSONModel();
			oHuHelpColModel.setData({
				"cols": [{
					"label": i18nResourceBundle.getText("handlingUnitId"),
					"template": "HandlingUnitExternalID"
						//	"width": "10rem"
				}, {
					"label": i18nResourceBundle.getText("packagingMaterials"),
					"template": "PackagingMaterial"
						//	"width": "10rem"
				}, {
					"label": i18nResourceBundle.getText("packagingMaterialType"),
					"template": "PackagingMaterialType"
						//	"width": "10rem"
				}, {
					"label": i18nResourceBundle.getText("warehouse"),
					"template": "Warehouse"
						//"width": "10rem"
				}]
			});
			const aCols = oHuHelpColModel.getData().cols;

			this._oHuValueHelpDialog = sap.ui.xmlfragment("HandlingUnitMappingApp.fragment.HuValueHelp", this);
			this.getView().addDependent(this._oHuValueHelpDialog);

			this._oHuValueHelpDialog.getTableAsync().then(function (oTable) {
				oTable.setModel(this.getView().getModel("HandlingUnitsModel"));
				oTable.setModel(oHuHelpColModel, "columns");

				if (oTable.bindRows) {
					oTable.bindAggregation("rows", "/HandlingUnit");
				}

				if (oTable.bindItems) {
					oTable.bindAggregation("items", "/HandlingUnit", function () {
						return new ColumnListItem({
							cells: aCols.map(function (column) {
								return new Label({
									text: "{" + column.template + "}"
								});
							})
						});
					});
				}

				this._oHuValueHelpDialog.update();
			}.bind(this));
			this._oHuValueHelpDialog.open();
		},

		//handle hu value help functions
		onHuValueHelpOk: function (oEvent) {
			const aTokens = oEvent.getParameter("tokens");
			this.huValueHelpUserInput.setValue(aTokens[0].getKey());
			this._oHuValueHelpDialog.close();
		},

		//handle hu value help functions
		onHuValueHelpCancel: function () {
			this._oHuValueHelpDialog.close();
		},

		//handle hu value help functions
		onHuValueHelpAfter: function () {
			this._oHuValueHelpDialog.destroy();
		},

		/*
		 *  Sensor Value Help 
		 */
		onSensorValueHelpRequested: function (oEvent) {
			this.sensorValueHelpUserInput = oEvent.getSource();
			const i18nResourceBundle = this.getView().getModel("i18n").getResourceBundle();

			const oSensorHelpColModel = new sap.ui.model.json.JSONModel();
			oSensorHelpColModel.setData({
				"cols": [{
					"label": i18nResourceBundle.getText("name"),
					"template": "name"
				}, {
					"label": i18nResourceBundle.getText("alternateID"),
					"template": "alternateId"
				}, {
					"label": i18nResourceBundle.getText("id"),
					"template": "sensorId"
				}, {
					"label": i18nResourceBundle.getText("gateway"),
					"template": "gateway",
					"width": "8rem"
				}, {
					"label": i18nResourceBundle.getText("status"),
					"template": "status",
					"width": "5rem"
				}]
			});
			const aCols = oSensorHelpColModel.getData().cols;
			const oSensorModel = this.getView().getModel("IoTSensorsModel");

			this._oSensorValueHelpDialog = sap.ui.xmlfragment("HandlingUnitMappingApp.fragment.SensorValueHelp", this);
			this.getView().addDependent(this._oSensorValueHelpDialog);

			this._oSensorValueHelpDialog.getTableAsync().then(function (oTable) {
				oSensorModel.setDefaultBindingMode(sap.ui.model.BindingMode.OneWay);
				oTable.setModel(oSensorModel);
				oTable.setModel(oSensorHelpColModel, "columns");

				if (oTable.bindRows) {
					oTable.bindAggregation("rows", "/");
				}

				if (oTable.bindItems) {
					oTable.bindAggregation("items", "/", function () {
						return new ColumnListItem({
							cells: aCols.map(function (column) {
								return new Label({
									text: "{" + column.template + "}"
								});
							})
						});
					});
				}

				this._oSensorValueHelpDialog.update();
			}.bind(this));
			this._oSensorValueHelpDialog.open();
		},

		//handle sensor value help functions
		onSensorValueHelpOk: function (oEvent) {
			const aTokens = oEvent.getParameter("tokens");
			this.sensorValueHelpUserInput.setValue(aTokens[0].getKey());
			this._oSensorValueHelpDialog.close();
		},

		//handle sensor value help functions
		onSensorValueHelpCancel: function () {
			this._oSensorValueHelpDialog.close();
		},

		//handle sensor value help functions
		onSensorValueHelpAfter: function () {
			this._oSensorValueHelpDialog.destroy();
		},

		/*
		 *  Boilerplate code
		 */
		action: function (oEvent) {
			const that = this;
			const actionParameters = JSON.parse(oEvent.getSource().data("wiring").replace(/'/g, "'"));
			const eventType = oEvent.getId();
			const aTargets = actionParameters[eventType].targets || [];
			for (const oTarget of aTargets) {
				const oControl = that.byId(oTarget.id);
				if (oControl) {
					const oParams = {};
					for (const prop in oTarget.parameters) {
						oParams[prop] = oEvent.getParameter(oTarget.parameters[prop]);
					}
					oControl[oTarget.action](oParams);
				}
			}
			const oNavigation = actionParameters[eventType].navigation;
			if (oNavigation) {
				const oParams = {};
				(oNavigation.keys || []).forEach(function (prop) {
					oParams[prop.name] = encodeURIComponent(JSON.stringify({
						value: oEvent.getSource().getBindingContext(oNavigation.model).getProperty(prop.name),
						type: prop.type
					}));
				});
				if (Object.getOwnPropertyNames(oParams).length !== 0) {
					this.getOwnerComponent().getRouter().navTo(oNavigation.routeName, oParams);
				} else {
					this.getOwnerComponent().getRouter().navTo(oNavigation.routeName);
				}
			}
		},

		/* 
		Read Data from BarCodeScanner, validate and add to model
		*/
		onPressBarCodeIcon: function (oEvent) {
			var lastSelectedInputId = this.getView().getModel("BarCodeData").getProperty("/lastSelectedInputFieldForBarCode");
			if (lastSelectedInputId === "" || lastSelectedInputId === null) {
				MessageToast.show(this.getView().getModel("i18n").getResourceBundle().getText("ScanningSelectionInfo"));
			} else {
				this.onScanForValue(oEvent, lastSelectedInputId);
			}
		},

		/*
		Add a Message to the MessageManager
		*/
		addMessageToMessageManager: function (messageText, typeOfMessage) {
			var oMessage = new sap.ui.core.message.Message({
				message: messageText,
				persistent: true, // make message transient
				type: typeOfMessage //type: sap.ui.core.MessageType.Error
			});

			var oMessageManager = sap.ui.getCore().getMessageManager();
			oMessageManager.addMessages(oMessage);
		},
		/*
		Create and open error dialog for better attention
		*/
		openErrorMessageDialog: function (text) {
			const i18nResourceBundle = this.getView().getModel("i18n").getResourceBundle();
			if (!this.oErrorMessageDialog) {
				this.oErrorMessageDialog = new Dialog({
					type: DialogType.Message,
					title: i18nResourceBundle.getText("warning"),
					state: ValueState.Warning,
					content: new Text({
						text: text
					}),
					beginButton: new Button({
						type: ButtonType.Emphasized,
						text: i18nResourceBundle.getText("ok"),
						press: function () {
							this.oErrorMessageDialog.close();
						}.bind(this)
					})
				});
			}

			this.oErrorMessageDialog.open();
		},
		/*
		On Enter jump to next input
		*/
		focusNext: function (oEvent) {
			//get all list inputs
			var inputElements = $("[id*='mappingList-listUl']").find("input");
			for (var i = 0; i < inputElements.length; i++) {

				//focus next input if not last input
				if (inputElements[i].id.includes(oEvent.getParameter("id")) && i !== inputElements.length - 1) {
					inputElements[i + 1].focus();
					return;

				} else if (inputElements[i].id.includes(oEvent.getParameter("id")) && i === inputElements.length - 1) {

					//if it is the last input -> Add empty list entry and focus new input
					const oListItemsModel = this.getOwnerComponent().getModel("ListItemsModel");
					const oListData = oListItemsModel.getData();
					const oLastItem = oListData[oListData.length - 1];

					if (oLastItem !== null && oLastItem.handlingUnit.handlingUnitId.length > 0) {
						this.addListItem();
						inputElements = $("[id*='mappingList-listUl']").find("input");
						inputElements[i + 1].focus();
					}
				}
			}
		},
		/*
		Scan BarCode and insert into last selected input field
		*/
		onScanForValue: function (oEvent, lastSelectedInputId) {
			const i18nResourceBundle = this.getView().getModel("i18n").getResourceBundle();
			if (!this._oScanDialog) {
				this._oScanDialog = new sap.m.Dialog({
					title: i18nResourceBundle.getText("scanBoxTitle"),
					contentWidth: "640px",
					contentHeight: "480px",
					horizontalScrolling: false,
					verticalScrolling: false,
					stretchOnPhone: true,
					content: [new sap.ui.core.HTML({
						id: this.createId("scanContainer"),
						content: "<div />"
					})],
					endButton: new sap.m.Button({
						text: i18nResourceBundle.getText("cancel"),
						press: function () {
							this._oScanDialog.close();
						}.bind(this)
					}),
					afterOpen: function () {
						this._initQuagga(this.getView().byId("scanContainer").getDomRef()).done(function () {
							// Initialisation done, start Quagga
							Quagga.start();
						}).fail(function (oError) {
							// Failed to initialise, show message and close dialog...this should not happen as we have
							// already checked for camera device ni /model/models.js and hidden the scan button if none detected
							MessageToast.show(oError.message.length ? oError.message : (i18nResourceBundle.getText("ScanBoxErrorCode") + oError.name), {
								onClose: function () {
									this._oScanDialog.close();
								}.bind(this)
							});
						}.bind(this));
					}.bind(this),
					afterClose: function () {
						// Dialog closed, stop Quagga
						Quagga.stop();
					}
				});

				this.getView().addDependent(this._oScanDialog);
			}

			this._oScanDialog.open();

		},
		/*
		Init Bar Code Scanner
		*/
		_initQuagga: function (oTarget) {
			var oDeferred = jQuery.Deferred();
			var barCodeType = this.getView().getModel("deploymentParametersModel").getProperty("/barcodeType");

			// Initialise Quagga plugin - see https://serratus.github.io/quaggaJS/#configobject for details
			Quagga.init({
				inputStream: {
					type: "LiveStream",
					target: oTarget,
					constraints: {
						width: {
							min: 640
						},
						height: {
							min: 480
						},
						facingMode: "environment"
					}
				},
				locator: {
					patchSize: "medium",
					halfSample: true
				},
				numOfWorkers: 2,
				frequency: 10,
				decoder: {
					readers: [{
						format: barCodeType,
						config: {}
					}]
				},
				locate: true
			}, function (error) {
				if (error) {
					oDeferred.reject(error);
				} else {
					oDeferred.resolve();
				}
			});

			if (!this._oQuaggaEventHandlersAttached) {
				// Attach event handlers...

				Quagga.onProcessed(function (result) {
					var drawingCtx = Quagga.canvas.ctx.overlay,
						drawingCanvas = Quagga.canvas.dom.overlay;

					if (result) {
						// The following will attempt to draw boxes around detected barcodes
						if (result.boxes) {
							drawingCtx.clearRect(0, 0, parseInt(drawingCanvas.getAttribute("width")), parseInt(drawingCanvas.getAttribute("height")));
							result.boxes.filter(function (box) {
								return box !== result.box;
							}).forEach(function (box) {
								Quagga.ImageDebug.drawPath(box, {
									x: 0,
									y: 1
								}, drawingCtx, {
									color: "green",
									lineWidth: 2
								});
							});
						}

						if (result.box) {
							Quagga.ImageDebug.drawPath(result.box, {
								x: 0,
								y: 1
							}, drawingCtx, {
								color: "#00F",
								lineWidth: 2
							});
						}

						if (result.codeResult && result.codeResult.code) {
							Quagga.ImageDebug.drawPath(result.line, {
								x: "x",
								y: "y"
							}, drawingCtx, {
								color: "red",
								lineWidth: 3
							});
						}
					}
				}.bind(this));

				var that = this;

				Quagga.onDetected(function (result) {
					// Barcode has been detected, value will be in result.codeResult.code. If requierd, validations can be done 
					// on result.codeResult.code to ensure the correct format/type of barcode value has been picked up
					var lastSelectedInputId = this.getView().getModel("BarCodeData").getProperty("/lastSelectedInputFieldForBarCode");
					var lastSelectedModel = "";
					var barcodePrefix = this.getView().getModel("deploymentParametersModel").getProperty("/prefix_BarCode");
					var barcodesuffix = this.getView().getModel("deploymentParametersModel").getProperty("/suffix_BarCode");

					if (lastSelectedInputId !== "" && lastSelectedInputId !== null) {
						var targetInputIdSplitRes = lastSelectedInputId.split("-inner");
						lastSelectedModel = sap.ui.getCore().byId(targetInputIdSplitRes[0]);
						lastSelectedModel.setValue(barcodePrefix + result.codeResult.code + barcodesuffix);

						var barCodeModel = that.getView().getModel("BarCodeData");
						barCodeModel.setProperty("/lastSelectedInputFieldForBarCode", "");
						that.getView().setModel(barCodeModel, "BarCodeData");

						that.getView().getModel("ListItemsModel").refresh(true);
						that.validateAllSensors();
						that.validateAllHandlingUnits();
					}

					// Close dialog
					this._oScanDialog.close();
				}.bind(this));

				// Set flag so that event handlers are only attached once...
				this._oQuaggaEventHandlersAttached = true;
			}

			return oDeferred.promise();
		}

	});
});
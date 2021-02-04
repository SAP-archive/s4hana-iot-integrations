"use strict";

var xssec = require("@sap/xssec");
var xsenv = require('@sap/xsenv');
var axios = require("axios");
var request = require('request');

const rp = require('request-promise');
const dest_service = xsenv.getServices({ dest: { tag: 'destination' } }).dest;
const uaa_service = xsenv.getServices({ uaa: { tag: 'xsuaa' } }).uaa;
const connectivity_service = xsenv.getServices({ connectivity: { tag: 'connectivity' } }).connectivity;
const proxy_url = 'http://'+connectivity_service["onpremise_proxy_host"] + ':' + connectivity_service["onpremise_proxy_port"];
const connUaaCredentials = connectivity_service.clientid + ':' + connectivity_service.clientsecret;
const sUaaCredentials = dest_service.clientid + ':' + dest_service.clientsecret;


class s4op {
    static getMatDeliveries(ts, destination) {
        return new Promise(function(resolve, reject) {

            console.log("Get UAA token");
            var dest_call = rp({
                uri: uaa_service.url + '/oauth/token',
                method: 'POST',
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(sUaaCredentials).toString('base64'),
                    'Content-type': 'application/x-www-form-urlencoded'
                },
                form: {
                    'client_id': dest_service.clientid,
                    'grant_type': 'client_credentials'
                }
            }).then((data) => {

                console.log("Get destination details");
                const token = JSON.parse(data).access_token;
                return rp({
                    uri: dest_service.uri + '/destination-configuration/v1/destinations/' + destination,
                    headers: {
                        'Authorization': 'Bearer ' + token
                    }
                });
            }).then((data) => {
                console.log("Get connectivity service token ");

                const oDestination = JSON.parse(data);
                const token = oDestination.authTokens[0];
                const destConfigUrl = oDestination.destinationConfiguration['URL'];
                console.log(JSON.stringify(destConfigUrl));

                var _include_headers = function (body, response, resolveWithFullResponse) {
                    return {'headers': response.headers, 'data': body};
                };

                console.log("Get Connectivity Service token");

                var conn_token = rp({
                    uri: uaa_service.url + '/oauth/token',
                    method: 'POST',
                    headers: {
                        'Authorization': 'Basic ' + Buffer.from(connUaaCredentials).toString('base64'),
                        'Content-type': 'application/x-www-form-urlencoded'
                    },
                    form: {
                        'client_id': connectivity_service.clientid,
                        'grant_type': 'client_credentials'
                    }
                }).then((conn_token_data) => {
                    const conn_token = JSON.parse(conn_token_data).access_token;

                    console.log("Step on Prem Token Fetch from sales order api to get cookies");
                    return rp({
                        method: 'GET',
                        uri: destConfigUrl + '/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem(SalesOrder=\'2915717\',SalesOrderItem=\'10\')?$select=SalesOrder,SalesOrderItem,NetAmount,TransactionCurrency,to_SalesOrder/PurchaseOrderByCustomer',
                        proxy:proxy_url,
                        headers: {
                            'Authorization': `${token.type} ${token.value}`,
                            'Proxy-Authorization': 'Bearer ' + conn_token,
                            'X-CSRF-TOKEN': 'Fetch',
                            'Content-type': 'application/json'
                        },
                        rejectUnauthorized: false,
                        transform:_include_headers
                    }).then((onPrem_token_data) => {
                        console.log("Cookies retrieved from sales order api call");
                        const cookieObj = onPrem_token_data.headers['set-cookie'];

                        var cookieObjValue1 = cookieObj[1];
                        var cookieObjValue2 = cookieObj[2];

                        var sapUsercontext = 'sap-usercontext=sap-client=001'//getCookie('sap-usercontext');
                        var MYSAPSSO2 = cookieObjValue1.split(';')[0];
                        var SAP_SESSIONID_ER9_001 = cookieObjValue2.split(';')[0];

                        var cookieString = sapUsercontext + '; ' + MYSAPSSO2 + '; ' + SAP_SESSIONID_ER9_001;
                        //console.log("cookieString: " +cookieString);


                        console.log("Getting Deliveries");
                        s4op.getDeliveriesByTimestamp(ts,destConfigUrl, token, conn_token, cookieString)
                            .then((deliveryList) => {
                                console.log("delivery list response received:" + deliveryList);

                                var getList = JSON.parse(deliveryList);
                                const delList = getList.d.results;

                                var delIdList = [];
                                var bpIdList = [];
                                var contactMapByD = {};
                                var soIdList = [];
                                var huQueryList = [];

                                //extract delivery ids
                                for(var i=0; i<delList.length; i++) {
                                    var del = delList[i];
                                    delIdList.push(del.Vbeln); //vbeln is the delivery id
                                    console.log("DeliveryIdList =" + delIdList);
                                    bpIdList.push(del.Kunnr); //Collect Business Partner id

                                    //Create map for Handling unit api call
                                    huQueryList.push(["01", "00"+del.Vbeln]); //object and objkey(delivery id)
                                    console.log("huQueryList =" + huQueryList);

                                    //Collect the SalesOrder and SalesOrderItem ids
                                    for(var j=0; j<del.to_EtDeliveryItemSet.results.length; j++) { // Go through all delivery items
                                        var dItem = del.to_EtDeliveryItemSet.results[j];
                                        soIdList.push([dItem.Vgbel, s4op.removeLeadingZero(dItem.Vgpos)]);
                                        console.log("SoIdList =" + soIdList);
                                    }

                                    // Collect Business Partner contact information
                                    for(var j=0; j<del.to_EtDeliveryPartnerSet.results.length; j++) {
                                        var partner = del.to_EtDeliveryPartnerSet.results[j];
                                        if(partner.Parvw=="SP") { // Only partners with function "SP" (Sold-to Party)
                                            bpIdList.push(partner.Parnr);
                                            console.log("BusPartnerIdList =" + bpIdList);
                                            contactMapByD[del.Vbeln] = partner.Parnr;
                                            console.log("contactMapByD =" + contactMapByD);
                                        }
                                    }
                                }

                                s4op.getHandlingUnitByDeliveryIds(huQueryList, destConfigUrl, token, conn_token, cookieString)
                                    .then((responseHuList) => {

                                        console.log("responseHuList:" + JSON.stringify(responseHuList));
                                        const huList = responseHuList;
                                        console.log("huList:" + huList);

                                        var dItemMap = {};

                                        for(var i=0; i<huList.length; i++) {
                                            var hu = huList[i];

                                            for(var j=0; j<hu.to_HuItemSet.results.length; j++) {
                                                var huItem = hu.to_HuItemSet.results[j];
                                                var huItemId = huItem.ObjItemNumber;
                                                // HU Item ID (10 chars) corresponds with Delivery Item ID (6 chars) and maybe padded with 0's, if so, strip the padding
                                                if(huItemId.length==10 && huItemId.substring(0, 4)=='0000')
                                                    huItemId = huItemId.substring(4);
                                                dItemMap[s4op.getKey(huItem.ObjectDoc, huItemId)] = {"hu": hu, "huItem": huItem};
                                            }
                                        }
                                        console.log("dItemMapcreated:" + JSON.stringify(dItemMap));


                                        s4op.filterDeliveryItemsByHUItems(delList, dItemMap);
                                        console.log("Filtered Delivery List" + JSON.stringify(delList));

                                        //get sales order item details
                                        s4op.getSoItemByIdList(soIdList, destConfigUrl, token, conn_token, cookieString)
                                            .then((soItemList) => {

                                                //get business partner details
                                                s4op.getBusPartnerByIdList(bpIdList, destConfigUrl, token, conn_token, cookieString)
                                                    .then((busPartnerList) => {

                                                        var result = s4op.buildFinalResult(huList, delList, dItemMap, busPartnerList, soItemList, contactMapByD);

                                                        resolve(result);

                                                    }).catch((error) => {
                                                    console.log("Error in BusPartner_Api call" + error);
                                                    reject(error);
                                                });
                                            }).catch((error) => {
                                                console.log("Error in SoItem call" + error);
                                                reject(error);
                                               });
                                    }).catch((error) => {
                                    console.log("Error in HU_Api call" + error);
                                    reject(error);
                                });
                            }).catch((errorDelivery) => {
                            console.log(errorDelivery);
                        })
                    }).catch((error) => {
                        console.log(error);
                        reject(error);
                      });
                }).catch((error) => {
                     console.log(error);
                     reject(error);
                  });
            }).catch((error) => {
                console.log(error);
                reject(error);
               });
        });
    }


    /**
     * Outbound Delivery service call
     */
    static getDeliveriesByTimestamp(ts, destUrl, destination_token, connectivityServiceToken, cookieString){
        return new Promise(function(resolve, reject) {
            var options = { //as hu api handle one hu_id -> url here is an example for one vbeln
                'method': 'GET',
                'url': destUrl + '/sap/opu/odata/SAP/Z_4IH_BAPI_DELIVERY_GETLIST_SRV;v=0002/EtDeliveryHeaderSet?$format=json&$filter=Vbeln eq \'80102145\' and Kunnr ne \'\'&$expand=to_EtDeliveryItemSet,to_EtDeliveryPartnerSet&$select=Vbeln,Kunnr,to_EtDeliveryItemSet/Vbeln,to_EtDeliveryItemSet/Posnr,to_EtDeliveryItemSet/Matnr,to_EtDeliveryItemSet/Matkl,to_EtDeliveryItemSet/Lfimg,to_EtDeliveryItemSet/Meins,to_EtDeliveryItemSet/Arktx,to_EtDeliveryItemSet/Vgbel,to_EtDeliveryItemSet/Vgpos,to_EtDeliveryPartnerSet/Parnr,to_EtDeliveryPartnerSet/Parvw',
                proxy:proxy_url,
                'headers': {
                    'Content-Type': 'application/json',
                    'Authorization': `${destination_token.type} ${destination_token.value}`,
                    'Proxy-Authorization': 'Bearer ' + connectivityServiceToken,
                    'Cookie': cookieString
                },
                rejectUnauthorized: false
            };
            console.log('Delivery api Url:' +options.url);
            request(options, function (error, response) {
                if (error){
                    console.log('Outbound_Delivery api error:' + error);
                    reject(error);
                }
                console.log('deliveryApiResult =' + response.body);
                resolve(response.body);
            })
        });
    }


    /**
     * Handling_Unit service call
     */
    static getHandlingUnitByDeliveryIds(huQueryList, destUrl, destination_token, connectivityServiceToken, cookieString){
        return s4op.getOnPremiseEntitiesInGroup(huQueryList, ["Object", "Objkey"], s4op.getHandlingUnitByFilter,destUrl, destination_token, connectivityServiceToken, cookieString);
    }

    static getHandlingUnitByFilter(filter, destUrl, destination_token, connectivityServiceToken, cookieString){
        return new Promise(function(resolve, reject) {
            var options = {
                'method': 'GET',
                'url': destUrl + "/sap/opu/odata/SAP/Z_4IH_BAPI_HU_GETLIST_SRV_01/HuHeaderSet?$inlinecount=allpages&$format=json&$filter=" + filter + "&$expand=to_HuItemSet&$select=ChangedDate,HuExid,HuId,PackMat,PackMatExternal,PackMatGuid,PackMatLong,to_HuItemSet/HuItemNumber,to_HuItemSet/HuItemType,to_HuItemSet/ObjectDoc,to_HuItemSet/ObjItemNumber,to_HuItemSet/PackQty,to_HuItemSet/BaseUnitQty,to_HuItemSet/AltUnitQtyIso,to_HuItemSet/LowerLevelExid,to_HuItemSet/AltUnitQty,to_HuItemSet/Material,to_HuItemSet/HuExid",
                proxy:proxy_url,
                'headers': {
                    'Content-Type': 'application/json',
                    'Authorization': `${destination_token.type} ${destination_token.value}`,
                    'Proxy-Authorization': 'Bearer ' + connectivityServiceToken,
                    'Cookie': cookieString
                },
                rejectUnauthorized: false
            };
            console.log('Handling_Unit api Url:' + options.url);
            request(options, function (error, response) {
                if (error){
                    console.log('Handling_Unit api error:' + error);
                    reject(error);
                }
                console.log('huApiResult =' + response.body);
                resolve(response.body);
            });
        });
    }


    /**
     * Sales_Order service call
     */
    static getSoItemByIdList(soIdList, destUrl, destination_token, connectivityServiceToken, cookieString){
        return s4op.getOnPremiseEntitiesInGroup(soIdList, ["SalesOrder", "SalesOrderItem"], s4op.getSoByFilter, destUrl, destination_token, connectivityServiceToken, cookieString);
    }

    static getSoByFilter(filter, destUrl, destination_token, connectivityServiceToken, cookieString){
        return new Promise(function(resolve, reject) {
            var options = {
                'method': 'GET',
                'url': destUrl + "/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem?&$format=json&$filter=" + filter + "&$select=SalesOrder,SalesOrderItem,NetAmount,TransactionCurrency,to_SalesOrder/PurchaseOrderByCustomer",
                proxy:proxy_url,
                'headers': {
                    'Content-Type': 'application/json',
                    'Authorization': `${destination_token.type} ${destination_token.value}`,
                    'Proxy-Authorization': 'Bearer ' + connectivityServiceToken,
                    'Cookie': cookieString
                },
                rejectUnauthorized: false
            };
            console.log('Sales_Order api Url:' + options.url);
            request(options, function (error, response) {
                if (error){
                    console.log('Sales_Order api error:' + error);
                    reject(error);
                }
                console.log('Sales_Order_Api_Result =' + response.body);
                resolve(response.body);
            });
        });
    }


    /**
     * Business_Partner service call
     */
    static getBusPartnerByIdList(bpIdList, destUrl, destination_token, connectivityServiceToken, cookieString){
        return s4op.getOnPremiseEntitiesInGroup(bpIdList, "BusinessPartner", s4op.getBusPartnerByFilter, destUrl, destination_token, connectivityServiceToken, cookieString);
    }

    static getBusPartnerByFilter(filter, destUrl, destination_token, connectivityServiceToken, cookieString){
        return new Promise(function(resolve, reject) {
            var options = {
                'method': 'GET',
                'url': destUrl + "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$filter=" + filter + "&$expand=to_BusinessPartnerAddress/to_EmailAddress&$select=BusinessPartner,BusinessPartnerName,to_BusinessPartnerAddress/to_EmailAddress/EmailAddress,to_BusinessPartnerAddress/to_EmailAddress/IsDefaultEmailAddress&$format=json",
                proxy:proxy_url,
                'headers': {
                    'Content-Type': 'application/json',
                    'Authorization': `${destination_token.type} ${destination_token.value}`,
                    'Proxy-Authorization': 'Bearer ' + connectivityServiceToken,
                    'Cookie': cookieString
                },
                rejectUnauthorized: false
            };
            console.log('BusinessPartner api Url:' + options.url);
            request(options, function (error, response) {
                if (error){
                    console.log('BusinessPartner api error:' + error);
                    reject(error);
                }
                console.log('BusinessPartner_Api_Result =' + response.body);
                resolve(response.body);
            });
        });
    }


    /**
     * Utility: Executes a service call to get a set of entities based on ids in "groups" for efficient retrieval
     */
    static getOnPremiseEntitiesInGroup(idList, idField, serviceFn, destUrl, destination_token, connectivityServiceToken, cookieString) {
        return new Promise(function(resolve, reject) {
            console.log("Non-unique Ids:");
            console.log(idList);

            if(idList.length==0) { // no ids, so can skip service call
                resolve([]);
            }

            // Remove duplicates to limit the queries
            if(idList[0] instanceof Array) { // Allow filter by multiple fields
                idList = idList.map((val) => { // flatten field values into single field to remove duplicates
                    return val.join(s4op.idSeparator)
                }).filter((val, index, list) => { // get unique list
                    return list.indexOf(val) === index;
                }).map((val) => { // unflatten field values back into array
                    return val.split(s4op.idSeparator);
                });
            }
            else {
                idList = idList.filter(function(val, index, list) { // get unique list
                    return list.indexOf(val) === index;
                });
            }

            console.log("Unique Ids:");
            console.log(idList);

            if(idList.length==0) { // no ids, so can skip service call
                resolve([]);
            }

            // Construct filter by groups of size 10
            var idFilterGroupSize = 10;
            var idFilterGroupList = [];
            for(var i=0; i<idList.length; i+=idFilterGroupSize) {
                idFilterGroupList.push(idList.slice(i, Math.min(idList.length, i+idFilterGroupSize)));
            }

            var resultList = [];
            var fnGetEntries = function() { // executed for each filter group
                var filterText = idFilterGroupList.shift().map(function(id) { // take the next filter group and build an OData filter text from it
                    if(id instanceof Array) {
                        var andFilter = [];
                        for(var i=0; i<id.length; i++) { // combine all field filters into single and filter
                            andFilter.push(idField[i] + " eq '" + id[i] + "'");
                        }
                        return "(" + andFilter.join(" and ") + ")" ;
                    }
                    else {
                        return idField + " eq '" + id + "'";
                    }
                }).join(" or ");

                console.log("filterText: " + filterText);
                serviceFn(filterText, destUrl, destination_token, connectivityServiceToken, cookieString) // call the service with the filter text
                    .then((response) => {
                        //console.log(response.data.d.results);
                        response = JSON.parse(response);
                        console.log(response);
                        console.log(response.d.results);
                        //console.log(response.data.d.results);
                        resultList = resultList.concat(response.d.results);
                        console.log("resultList:" + resultList);
                        if(idFilterGroupList.length==0) // done if no more filter groups to process
                            resolve(resultList); // simulate a single OData response
                        else
                            fnGetEntries(); // go to next idFilterGroup entry
                    })
                    .catch((error) => {
                        reject(error);
                    });
            }
            fnGetEntries();
        });
    }


    /**
     * Remove from the delivery list the delivery items without a corresponding handling unit item
     */
    static filterDeliveryItemsByHUItems(delList, dItemMap) {
        for(var i=0; i<delList.length; i++) { // Go through all deliveries
            var d = delList[i];
            for(var j=0; j<d.to_EtDeliveryItemSet.results.length; j++) { // Go through all delivery items for a given delivery
                var dItem = d.to_EtDeliveryItemSet.results[j];

                // only add delivery items that are represented in the HU Items
                var huItemInfo = dItemMap[s4op.getKey(dItem.Vbeln, dItem.Posnr)];
                if(!huItemInfo) {
                    console.log("Delivery document " + dItem.Vbeln + " and delivery item " + dItem.Posnr + " not part of the list of modified handling units");
                    d.to_EtDeliveryItemSet.results.splice(j, 1);
                    j--;
                    continue;
                }
            }
        }
    }


    /**
     * With all business object data in hand, built the result set for processing with the Leonardo IoT services
     */
    static buildFinalResult(huList, dList, dItemMap, bpList, soItemList, contactMapByD) {
        console.log("huList:");
        console.log(huList);
        console.log("dList:");
        console.log(dList);
        console.log("bpList:");
        console.log(bpList);
        console.log("soItemList:");
        console.log(soItemList);

        // Build a sales order map for lookup
        var soItemMap = {};
        for(var i=0; i<soItemList.length; i++) {
            var soItem = soItemList[i];
            soItemMap[s4op.getKey(soItem.SalesOrder, soItem.SalesOrderItem)] = soItem;
        }

        console.log("soItemMap_log" + JSON.stringify(soItemMap));

        // Build a business partner map for lookup
        var bpMapById = {};
        for(var i=0; i<bpList.length; i++) {
            bpMapById[bpList[i].BusinessPartner] = bpList[i];
        }

        var emailCache = {}; // Email address cache to avoid traversing the structure for the same contact

        var result = [];
        for(var i=0; i<dList.length; i++) { // Go through all deliveries
            var d = dList[i];
            for(var j=0; j<d.to_EtDeliveryItemSet.results.length; j++) { // Go through all delivery items for a given delivery
                var dItem = d.to_EtDeliveryItemSet.results[j];

                // Get the HandlingUnit and HandlingUnitItem
                var huItemInfo = dItemMap[s4op.getKey(d.Vbeln, dItem.Posnr)];
                console.log("huItemKeysUsed:" + JSON.stringify(s4op.getKey(d.Vbeln, dItem.Posnr)));

                var huItem = huItemInfo.huItem;
                var hu = huItemInfo.hu;
                var bpSoldToParty = bpMapById[d.Kunnr];

                // Get Contact Person email
                var bpContactId = contactMapByD[d.Vbeln];
                console.log("bpContactId:" +bpContactId);
                var email = emailCache[bpContactId];
                if(email==undefined)
                    email = emailCache[bpContactId] = s4op.getEmailFromContact(bpMapById[bpContactId]);
                    console.log("emailFound:" +email);

                // Get the Sales Order Item
                var soItem = soItemMap[s4op.getKey(dItem.Vgbel, s4op.removeLeadingZero(dItem.Vgpos))];
                console.log("soItem:" + JSON.stringify(soItem));
                //console.log("soItemKey:" + s4op.getKey(dItem.Vgbel, s4op.removeLeadingZero(dItem.Vgpos)));
                var so = soItem ? soItem.to_SalesOrder : undefined;
                console.log("so:" + JSON.stringify(so));


                // Build up result set to be used to update Leonardo IoT
                result.push({
                    "HandlingUnitId": hu.HuExid,
                    "MaterialType": dItem.Matkl,
                    "MaterialNumber": dItem.Matnr,
                    "basicData": {
                        "DeliveryItemText": dItem.Arktx,
                        "SalesOrder": dItem.Vgbel,
                        "SalesOrderItem": dItem.Vgpos,
                        "PackagingMaterial": hu.PackMat,
                        "Delivery": d.Vbeln,
                        "DeliveryItem": dItem.Posnr,
                        "SoldToPartyName": bpSoldToParty.BusinessPartnerName,
                        "Quantity": dItem.Lfimg,
                        "QuantityUnit": dItem.Meins,
                        "ContactEmail": email,
                        "NetAmount": soItem ? soItem.NetAmount : "",
                        "NetAmountCurrency": soItem ? soItem.TransactionCurrency : "",
                        "PurchaseOrder": "",
                    }
                });
            }
        }
        result.reverse(); // return in order received for clarity
        console.log("FinalResult:");
        console.log(result);

        return result;
    }


    /**
     * Gets the email address from a contact (business partner - bp), will get default email from first address
     */
    static getEmailFromContact(bp) {
        if(!bp)
            return "";

        for(var i=0; i<bp.to_BusinessPartnerAddress.results.length; i++) {
            var address = bp.to_BusinessPartnerAddress.results[i];
            for(var j=0; j<address.to_EmailAddress.results.length; j++) {
                var email = address.to_EmailAddress.results[j];
                if(email.IsDefaultEmailAddress)
                    return email.EmailAddress;
            }
        }

        return "";
    }

    static getKey(id1, id2) {
        return id1 + s4op.idSeparator + id2;
    }

    static removeLeadingZero(id){
        id =+id;
        return id;
    }

}

s4op.idSeparator = "-!-";

module.exports = s4op;
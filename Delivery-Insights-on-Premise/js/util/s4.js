"use strict";

var xssec = require("@sap/xssec");
var xsenv = require('@sap/xsenv');
var axios = require("axios");

class s4 {
  static getMaterialDeliveries(ts) {
    return new Promise(function(resolve, reject) {
      s4.getHandlingUnitByTimestamp(ts)
        .then((response) => {
          var huList = response.data.d.results;

          // extract the delivery id from the response
          var dItemMap = {};

          var dIdList = [];
          for(var i=0; i<huList.length; i++) {
            var hu = huList[i];
            dIdList.push(hu.HandlingUnitReferenceDocument); // HandlingUnitReferenceDocument of a Handling Unit is the Delivery Id

            for(var j=0; j<hu.to_HandlingUnitItem.results.length; j++) {
              var huItem = hu.to_HandlingUnitItem.results[j];
              var huItemId = huItem.HandlingUnitRefDocumentItem;
              // HU Item ID (10 chars) corresponds with Delivery Item ID (6 chars) and maybe padded with 0's, if so, strip the padding
              if(huItemId.length==10 && huItemId.substring(0, 4)=='0000')
                huItemId = huItemId.substring(4);
              dItemMap[s4.getKey(hu.HandlingUnitReferenceDocument, huItemId)] = {"hu": hu, "huItem": huItem};
            }
          }

          // Get the delivery details
          s4.getDeliveriesByIdList(dIdList)
            .then((dList) => {
              s4.filterDItemsByHUItems(dList, dItemMap);

              // extract the sold to party, contact person and sales order items from the response
              var bpIdList = [];
              var contactMapByD = {};
              var soIdList = [];
              for(var i=0; i<dList.length; i++) {
                var d = dList[i];
                bpIdList.push(d.SoldToParty); // SoldToParty of a Delivery is the Business Partner Id

                // Collect contact information
                for(var j=0; j<d.to_DeliveryDocumentPartner.results.length; j++) {
                  var partner = d.to_DeliveryDocumentPartner.results[j];
                  if(partner.PartnerFunction=="SP") { // Only partners with function "SP" (Sold-to Party)
                    bpIdList.push(partner.ContactPerson);
                    contactMapByD[d.DeliveryDocument] = partner.ContactPerson;
                  }
                }

                // Collect the SalesOrder and SalesOrderItem ids
                for(var j=0; j<d.to_DeliveryDocumentItem.results.length; j++) { // Go through all delivery items for a given delivery
                  var dItem = d.to_DeliveryDocumentItem.results[j];
                  soIdList.push([dItem.ReferenceSDDocument, dItem.ReferenceSDDocumentItem]);
                }
              }

              s4.getSalesOrderItemByIdList(soIdList)
                .then((soItemList) => {

                  // Get the business partner details
                  s4.getBusinessPartnerByIdList(bpIdList)
                    .then((bpList) => {
                      var result = s4.buildResult(huList, dList, dItemMap, bpList, soItemList, contactMapByD);

                      resolve(result);
                    })
                    .catch((error) => {
                      reject(error);
                    });
                })
                .catch((error) => {
                  reject(error);
                });
            })
            .catch((error) => {
              reject(error);
            });
        })
        .catch((error) => {
          reject(error);
        });
    });
  }

  /**
   * Handling Unit service call
   */
  static getHandlingUnitByTimestamp(ts) {
    return new Promise(function(resolve, reject) {
      var params = s4.getODataParamFromPropList([
        "HandlingUnitReferenceDocument",
        "HandlingUnitExternalID",
        "PackagingMaterial",
        "to_HandlingUnitItem/HandlingUnitRefDocumentItem",
        "to_HandlingUnitItem/HandlingUnitQuantity",
      ]);

      var s4AuthInfo = s4.getS4AuthInfo();

      var url = s4AuthInfo.s4Config.url + "/sap/opu/odata/sap/API_HANDLING_UNIT/HandlingUnit?$format=json&$inlinecount=allpages&$filter=LastChangeDateTime gt " + ts + " and HandlingUnitReferenceDocument ne ''&$expand=" + params.expandQuery + "&$select=" + params.selectQuery;
      console.log("getHandlingUnitByTimestamp url: " + url);

      axios.get(url, {headers: s4AuthInfo.headers})
        .then((response) => {
          console.log(response);
          resolve(response);
        })
        .catch((error) => {
          console.error(error);
          reject(error);
        });
    });
  }

  /**
   * Delivery service call
   */
  static getDeliveriesByIdList(deliveryIdList) {
    return s4.getEntitiesInGroup(deliveryIdList, "DeliveryDocument", s4.getDeliveriesByFilter);
  }

  static getDeliveriesByFilter(filter) {
    return new Promise(function(resolve, reject) {
      var params = s4.getODataParamFromPropList([
        "DeliveryDocument",
        "SoldToParty",
        "to_DeliveryDocumentItem/ReferenceSDDocument",
        "to_DeliveryDocumentItem/ReferenceSDDocumentItem",
        "to_DeliveryDocumentItem/DeliveryDocumentItem",
        "to_DeliveryDocumentItem/DeliveryDocumentItemText",
        "to_DeliveryDocumentItem/MaterialGroup",
        "to_DeliveryDocumentItem/Material",
        "to_DeliveryDocumentItem/ActualDeliveryQuantity",
        "to_DeliveryDocumentItem/DeliveryQuantityUnit",
        "to_DeliveryDocumentPartner/ContactPerson",
        "to_DeliveryDocumentPartner/PartnerFunction",
      ]);

      var s4AuthInfo = s4.getS4AuthInfo();
      var url = s4AuthInfo.s4Config.url + "/sap/opu/odata/sap/API_OUTBOUND_DELIVERY_SRV/A_OutbDeliveryHeader?$inlinecount=allpages&$format=json&$filter=" + filter + " and SoldToParty ne ''&$expand=" + params.expandQuery + "&$select=" + params.selectQuery;
      console.log("getDeliveriesByFilter url: " + url);

      axios.get(url, {headers: s4AuthInfo.headers})
        .then((response) => {
          console.log(response);
          resolve(response);
        })
        .catch((error) => {
          console.error(error);
          reject(error);
        });
    });
  }

  /**
   * Business Partner service call
   */
  static getBusinessPartnerByIdList(bpIdList) {
    return s4.getEntitiesInGroup(bpIdList, "BusinessPartner", s4.getBusinessPartnerByFilter);
  }

  static getBusinessPartnerByFilter(filter) {
    return new Promise(function(resolve, reject) {
      var params = s4.getODataParamFromPropList([
        "BusinessPartner",
        "BusinessPartnerName",
        "to_BusinessPartnerAddress/to_EmailAddress/EmailAddress",
        "to_BusinessPartnerAddress/to_EmailAddress/IsDefaultEmailAddress",
      ]);

      var s4AuthInfo = s4.getS4AuthInfo();
      var url = s4AuthInfo.s4Config.url + "/sap/opu/odata/sap/API_BUSINESS_PARTNER/A_BusinessPartner?$inlinecount=allpages&$format=json&$filter=" + filter + "&$expand=" + params.expandQuery + "&$select=" + params.selectQuery;
      console.log("getBusinessPartnerByFilter url: " + url);

      axios.get(url, {headers: s4AuthInfo.headers})
        .then((response) => {
          console.log(response);
          resolve(response);
        })
        .catch((error) => {
          console.error(error);
          reject(error);
        });
    });
  }

  /**
   * Sales Order service call
   */
  static getSalesOrderItemByIdList(soIdList) {
    return s4.getEntitiesInGroup(soIdList, ["SalesOrder", "SalesOrderItem"], s4.getSalesOrderItemByFilter);
  }

  static getSalesOrderItemByFilter(filter) {
    return new Promise(function(resolve, reject) {
      var params = s4.getODataParamFromPropList([
        "SalesOrder",
        "SalesOrderItem",
        "NetAmount",
        "TransactionCurrency",
        "to_SalesOrder/PurchaseOrderByCustomer",
      ]);

      var s4AuthInfo = s4.getS4AuthInfo();
      var url = s4AuthInfo.s4Config.url + "/sap/opu/odata/sap/API_SALES_ORDER_SRV/A_SalesOrderItem?$inlinecount=allpages&$format=json&$filter=" + filter + "&$expand=" + params.expandQuery + "&$select=" + params.selectQuery;
      console.log("getSalesOrderItemByFilter url: " + url);

      axios.get(url, {headers: s4AuthInfo.headers})
        .then((response) => {
          console.log(response);
          resolve(response);
        })
        .catch((error) => {
          console.error(error);
          reject(error);
        });
    });
  }

  /**
   * Remove from the delivery list the delivery items without a corresponding handling unit item
   */
  static filterDItemsByHUItems(dList, dItemMap) {
    for(var i=0; i<dList.length; i++) { // Go through all deliveries
      var d = dList[i];
      for(var j=0; j<d.to_DeliveryDocumentItem.results.length; j++) { // Go through all delivery items for a given delivery
        var dItem = d.to_DeliveryDocumentItem.results[j];

        // only add delivery items that are represented in the HU Items
        var huItemInfo = dItemMap[s4.getKey(d.DeliveryDocument, dItem.DeliveryDocumentItem)];
        if(!huItemInfo) {
          console.log("Delivery document " + d.DeliveryDocument + " and delivery item " + dItem.DeliveryDocumentItem + " not part of the list of modified handling units");
          d.to_DeliveryDocumentItem.results.splice(j, 1);
          j--;
          continue;
        }
      }
    }
  }

  /**
   * With all business object data in hand, built the result set for processing with the Leonardo IoT services
   */
  static buildResult(huList, dList, dItemMap, bpList, soItemList, contactMapByD) {
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
      soItemMap[s4.getKey(soItem.SalesOrder, soItem.SalesOrderItem)] = soItem;
    }

    // Build a business partner map for lookup
    var bpMapById = {};
    for(var i=0; i<bpList.length; i++) {
      bpMapById[bpList[i].BusinessPartner] = bpList[i];
    }

    var emailCache = {}; // Email address cache to avoid traversing the structure for the same contact

    var result = [];
    for(var i=0; i<dList.length; i++) { // Go through all deliveries
      var d = dList[i];
      for(var j=0; j<d.to_DeliveryDocumentItem.results.length; j++) { // Go through all delivery items for a given delivery
        var dItem = d.to_DeliveryDocumentItem.results[j];

        // Get the HandlingUnit and HandlingUnitItem
        var huItemInfo = dItemMap[s4.getKey(d.DeliveryDocument, dItem.DeliveryDocumentItem)];

        var huItem = huItemInfo.huItem;
        var hu = huItemInfo.hu;
        var bpSoldToParty = bpMapById[d.SoldToParty];

        if (bpSoldToParty) {

          // Get Contact Person email
          var bpContactId = contactMapByD[d.DeliveryDocument];
          var email = emailCache[bpContactId];
          if(email==undefined)
            email = emailCache[bpContactId] = s4.getEmailFromContact(bpMapById[bpContactId]);

          // Get the Sales Order Item
          var soItem = soItemMap[s4.getKey(dItem.ReferenceSDDocument, dItem.ReferenceSDDocumentItem)];
          var so = soItem ? soItem.to_SalesOrder : undefined;

          // Build up result set to be used to update Leonardo IoT
          result.push({
            "HandlingUnitId": hu.HandlingUnitExternalID,
            "MaterialType": dItem.MaterialGroup,
            "MaterialNumber": dItem.Material,
            "basicData": {
              "DeliveryItemText": dItem.DeliveryDocumentItemText,
              "SalesOrder": dItem.ReferenceSDDocument,
              "SalesOrderItem": dItem.ReferenceSDDocumentItem,
              "PackagingMaterial": hu.PackagingMaterial,
              "Delivery": d.DeliveryDocument,
              "DeliveryItem": dItem.DeliveryDocumentItem,
              "SoldToPartyName": bpSoldToParty.BusinessPartnerName,
              "Quantity": dItem.ActualDeliveryQuantity,
              "QuantityUnit": dItem.DeliveryQuantityUnit,
              "ContactEmail": email,
              "NetAmount": soItem ? soItem.NetAmount : "",
              "NetAmountCurrency": soItem ? soItem.TransactionCurrency : "",
              "PurchaseOrder": so ? so.PurchaseOrderByCustomer : "",
            }
          });
        }
      }
    }
    result.reverse(); // return in order received for clarity
    console.log("result:");
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

  /**
   *
   */
  static getKey(id1, id2) {
    return id1 + s4.idSeparator + id2;
  }

  /**
   * Utility: Takes a property list and returns OData $select and $expand values
   */
  static getODataParamFromPropList(propertyList) {
    // construct the expand query
    var expandList = [];
    for(var i=0; i<propertyList.length; i++) {
      var name = propertyList[i];
      var parts = name.split("/");
      if(parts.length>1) {
        expandList.push(parts.slice(0, parts.length-1).join("/"));
      }
    }

    expandList = expandList.filter(function(val, index, list) { // get unique list of nodes to expand
      return list.indexOf(val) === index;
    });

    return {
      "expandQuery": expandList.join(","),
      "selectQuery": propertyList.join(",")
    }
  }

  /**
   * Utility: Executes a service call to get a set entities based on ids in "groups" for efficient retrieval
   */
  static getEntitiesInGroup(idList, idField, serviceFn) {
    return new Promise(function(resolve, reject) {
      console.log("Non-unique Ids:");
      console.log(idList);

      if(idList.length==0) { // no ids, so can skip service call
        resolve([]);
      }

      // Remove duplicates to limit the queries
      if(idList[0] instanceof Array) { // Allow filter by multiple fields
        idList = idList.map((val) => { // flatten field values into single field to remove duplicates
          return val.join(s4.idSeparator)
        }).filter((val, index, list) => { // get unique list
          return list.indexOf(val) === index;
        }).map((val) => { // unflatten field values back into array
          return val.split(s4.idSeparator);
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
        serviceFn(filterText) // call the service with the filter text
          .then((response) => {
            console.log(response.data.d.results);
            resultList = resultList.concat(response.data.d.results);
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
   * Utility: Gets the authorization header from the environment
   */
  static getS4AuthInfo() {
    var s4Config = JSON.parse(process.env.S4);
    var basicAuth = Buffer.from(s4Config.username + ":" + s4Config.password).toString('base64');

    return {
      s4Config,
      headers: {
        Authorization: "Basic " + basicAuth
      }
    };
  }
}

s4.idSeparator = "-!-";

module.exports = s4;

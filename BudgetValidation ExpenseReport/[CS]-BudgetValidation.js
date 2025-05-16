/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */

define([], function () {
  //Using pageInit to make the neccessary fields Mandatory.
  function pageInit(context) {
    try {
      var CurrentRecord = context.currentRecord;
      var categoryLine = CurrentRecord.getSublist({
        sublistId: "expense",
      });
      //add the all the neccessary fields in the Array
      var mandatoryFields = ["category", "department", "class", "location"];
      for (var i = 0; i < mandatoryFields.length; i++) {
        var sublistColumn = categoryLine.getColumn({
          fieldId: mandatoryFields[i],
        });
        sublistColumn.isMandatory = true;
        log.debug("sublistColumn", sublistColumn);
      }
    } catch (error) {
      log.error("Error in PageInit", error.message);
    }
  }

  function validateLine(context) {
    try {
      var currentRecord = context.currentRecord;
      var sublistField = context.sublistId;
      if (sublistField != "expense") return;
      var errorMessages = [];
      var requiredFields = {
        category: null,
        department: null,
        class: null,
        location: null,
      };
      for (let key in requiredFields) {
        var value = currentRecord.getCurrentSublistValue({
          sublistId: "item",
          fieldId: key,
        });
        if (!_logValidation(value)) {
          errorMessages.push({
            success: false,
            message: `${key} does not hold any Value`,
          });
        }
        requiredFields[key] = value;
      }
      if (errorMessages.length > 0) return false;
      console.log("requiredFields", requiredFields);

      //Checks whether the combination exists..

      var budgetRecord = validCombination(requiredFields);
      if (!budgetRecord) return false;
    } catch (error) {
      log.error("Error in ValidateLine", error.message);
    }
  }
  function validCombination(requiredFields) {
    try {
      var searchObj = {};
      var result = util.getSearch(
        searchObj.type,
        searchObj.filter,
        searchObj.columns
      );
      if (result.length <= 0) {
        return false;
      }
      return result;
    } catch (error) {
      log.error("Error in seachValidteCombination", error.message);
    }
  }
  function _logValidation(value) {
    if (
      value != null &&
      value != "" &&
      value != undefined &&
      value != "undefined" &&
      value != "NaN" &&
      value != " " &&
      value != 0 &&
      value != "0"
    ) {
      return true;
    } else {
      return false;
    }
  }
  return {
    pageInit: pageInit,
    validateLine: validateLine,
  };
});

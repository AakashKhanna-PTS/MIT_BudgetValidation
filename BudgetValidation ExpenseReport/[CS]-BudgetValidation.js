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
      }
    } catch (error) {
      log.error("Error in PageInit", error.message);
    }
  }

  function validateLine(context) {}

  return {
    pageInit: pageInit,
    validateLine: validateLine,
  };
});

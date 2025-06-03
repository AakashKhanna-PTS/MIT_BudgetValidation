/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
var sublistId;
define(["SuiteScripts/budgetUpdateModule.js"], function (budgetModule) {
  function afterSubmit(context) {
    var currentRecord = context.newRecord;
    var tranType = currentRecord.type;
    log.debug("tranType", tranType);
    switch (tranType) {
      case "expensereport":
        sublistId = "expense";
        break;
      case "journalentry":
        sublistId = "line";
        break;
      case "purchaserequisition":
        sublistId = "item";
        break;
      case "purchaseorder":
        sublistId = "item";
        break;
      case "vendorbill":
        sublistId: "item";
        break;
      case "vendorcredit":
        sublistId: "item";
    }
    var lineCount = currentRecord.getLineCount({
      sublistId: sublistId,
    });
    var budgetIds = [];
    for (let i = 0; i < lineCount; i++) {
      var budgetId = currentRecord.getSublistValue({
        sublistId: sublistId,
        fieldId: "custcol_mit_alocted_budget",
        line: i,
      });
      if (!budgetIds.includes(budgetId)) {
        budgetIds.push(budgetId);
      }
    }
    for (let i = 0; i < budgetIds.length; i++) {
      budgetModule.updateBudget(budgetIds[i]);
    }
    log.debug("budgetIds", budgetIds);
  }

  return {
    afterSubmit: afterSubmit,
  };
});

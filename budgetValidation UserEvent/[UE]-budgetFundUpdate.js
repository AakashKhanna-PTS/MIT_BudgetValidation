/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(["SuiteScripts/pts_helper", "N/record"], function (util, record) {
  function afterSubmit(context) {
    try {
      var currentRecord = context.newRecord;
      var tranType = currentRecord.type;
      if (tranType == "purchaseorder") {
        var requiredData = getDataFromPO(currentRecord);
        // if (!requiredData) {
        //   log.debug("logicFailed");
        //   return true;
        // }
        var budgetList = requiredData.allocatedBudgetList;
        getAllsearches(budgetList);
      }
      var lineCount = currentRecord.getLineCount({
        sublistId: "expense",
      });
      var allocatedBudgetList = [];
      for (let i = 0; i < lineCount; i++) {
        var allocatedBudget = currentRecord.getSublistValue({
          sublistId: "expense",
          fieldId: "custcol_mit_alocted_budget",
          line: i,
        });
        if (!allocatedBudgetList.includes(allocatedBudget)) {
          allocatedBudgetList.push(allocatedBudget);
        }
      }

      var budgetFundTotal = getTotalConsumedAmount(allocatedBudgetList);
      for (key in budgetFundTotal) {
        var recId = record.submitFields({
          type: "customrecord_pts_mit_budgetfunds",
          id: key,
          values: { custrecord_pts_mit_consumedamnt: budgetFundTotal[key] },
        });
        log.debug("SuccessfullySaved", recId);
      }
      log.debug("budgetFundTotalObject", budgetFundTotal);
    } catch (error) {
      log.error("Error in afterSubmit", error.message);
    }
  }
  function getTotalPOBudgetConsumed(budgetList, recId) {
    log.debug("BudgetList", budgetList);
    for (let i = 0; i < budgetList.length; i++) {
      var budgetID = budgetList[i];
      var allPrList = getNoneOfPRsearch(requiredData.prID, budgetID);
      var currentprList = getSpecificPRserch(requiredData.prID, budgetID);
      var allPoList = getNoneOfPOsearch(recId, budgetID);
      var currentpoList = getSpecificPOserch(recId, budgetID);
      log.debug("nonPOlist", nonPoList);
      log.debug("polist", poList);
      if (_logValidation(allPrList)) {
        //This gives the data of all the PR except for the linked PR in the PO
        var allReqisitionTotalConsumed = getTotalAmount(allPrList);
        log.debug("reqistionConsumed", allReqisitionTotalConsumed);
      }
      if (_logValidation(currentprList)) {
        //This gives the data only for current PR linked to the PO
        var currentPRconsumed = getTotalAmount(currentprList);
        log.debug("createdFromPRConsumed", currentPRconsumed);
      }
      if (_logValidation(allPoList)) {
        //This gives the data of all the P0 except for the current PO
        var allPoTotalConsumed = getTotalAmount(allPoList);
        log.debug("nonPOtotalConsumed", allPoTotalConsumed);
      }
      if (_logValidation(currentpoList)) {
        //This gives the data only for current PO
        var currentPOconsumed = getTotalAmount(currentpoList);
        log.debug("PoTotalConsumed", currentPOconsumed);
      }
    }
  }
  function getTotalConsumedAmount(allocatedBudgetList) {
    try {
      var budgetFundTotal = {};
      for (let i = 0; i < allocatedBudgetList.length; i++) {
        var budgetId = allocatedBudgetList[i];
        var expenseList = getExpenseConsumedAmountSearch(budgetId);
        var reqisitionList = getPRconsumedAmountSearch(budgetId);
        var purchaseList = getPOconsumedAmountSearch(budgetId);
        log.debug("purchaseList", purchaseList);
        log.debug("ExpenseList", expenseList);
        log.debug("reqistionList", reqisitionList);
        var expenseTotalConsumed = 0;
        var reqisitionTotalConsumed = 0;
        if (_logValidation(expenseList)) {
          expenseTotalConsumed = getTotalAmount(expenseList);
          log.debug("TotalExpenseConsumed", expenseTotalConsumed);
        }
        if (_logValidation(reqisitionList)) {
          reqisitionTotalConsumed = getTotalAmount(reqisitionList);
          log.debug("reqistionConsumed", reqisitionTotalConsumed);
        }
        var totalConsumed = reqisitionTotalConsumed + expenseTotalConsumed;
        budgetFundTotal[budgetId] = parseInt(totalConsumed);
      }
      return budgetFundTotal;
    } catch (error) {
      log.error("Error in getTotal", error.message);
    }
  }
  function getTotalAmount(list) {
    var sum = 0;
    for (let i = 0; i < list.length; i++) {
      var row = list[i];
      sum += Number(row.amount);
    }
    return sum;
  }
  function getExpenseConsumedAmountSearch(budgetFund) {
    try {
      var searchObj = {
        type: "expensereport",
        filters: [
          ["type", "anyof", "ExpRept"],
          "AND",
          ["custcol_mit_alocted_budget", "anyof", budgetFund],
        ],
        columns: [
          { name: "mainline", label: "*" },
          { name: "amount", label: "Amount" },
        ],
      };
      var result = util.getSearch(
        searchObj.type,
        searchObj.filters,
        searchObj.columns
      );
      if (result.length <= 0) {
        return false;
      }
      return result;
    } catch (error) {
      log.error("Error in Expense search", error.message);
    }
  }
  function getPRconsumedAmountSearch(budgetFund) {
    try {
      var searchObj = {
        type: "purchaserequisition",
        filters: [
          ["type", "anyof", "PurchReq"],
          "AND",
          ["custcol_mit_alocted_budget", "anyof", budgetFund],
        ],
        columns: [
          { name: "mainline", label: "*" },
          { name: "amount", label: "Amount" },
        ],
      };

      var result = util.getSearch(
        searchObj.type,
        searchObj.filters,
        searchObj.columns
      );
      if (result.length <= 0) {
        return false;
      }
      return result;
    } catch (error) {
      log.error("Error in PR search", error.message);
    }
  }
  function getPOconsumedAmountSearch(budgetFund) {
    var searchObj = {
      type: "purchaseorder",
      filters: [
        ["type", "anyof", "PurchReq"],
        "AND",
        ["custcol_mit_alocted_budget", "anyof", budgetFund],
      ],
      columns: [
        { name: "mainline", label: "*" },
        { name: "amount", label: "Amount" },
        { name: "linkedorder", label: "Linked order" },
      ],
    };

    var result = util.getSearch(
      searchObj.type,
      searchObj.filters,
      searchObj.columns
    );
    if (result.length <= 0) {
      return false;
    }
    return result;
  }

  //Unique Searchs needs modification
  function getNoneOfPRsearch(prID, budgetFund) {
    try {
      var searchObj = {
        type: "purchaserequisition",
        filters: [
          ["type", "anyof", "PurchReq"],
          "AND",
          ["internalid", "noneof", prID],
          "AND",
          ["custcol_mit_alocted_budget", "anyof", budgetFund],
        ],
        columns: [
          { name: "mainline", label: "*" },
          { name: "amount", label: "Amount" },
        ],
      };

      var result = util.getSearch(
        searchObj.type,
        searchObj.filters,
        searchObj.columns
      );
      if (result.length <= 0) {
        return false;
      }
      return result;
    } catch (error) {
      log.error("Error in PR search", error.message);
    }
  }
  function getSpecificPRserch(prID, budgetFund) {
    try {
      var searchObj = {
        type: "purchaserequisition",
        filters: [
          ["type", "anyof", "PurchReq"],
          "AND",
          ["internalid", "anyof", prID],
          "AND",
          ["custcol_mit_alocted_budget", "anyof", budgetFund],
        ],
        columns: [
          { name: "mainline", label: "*" },
          { name: "amount", label: "Amount" },
        ],
      };

      var result = util.getSearch(
        searchObj.type,
        searchObj.filters,
        searchObj.columns
      );
      if (result.length <= 0) {
        return false;
      }
      return result;
    } catch (error) {
      log.error("Error in PR search", error.message);
    }
  }
  function getSpecificPOserch(poId, budgetFund) {
    try {
      var searchObj = {
        type: "purchaseorder",
        filters: [
          ["type", "anyof", "PurchOrd"],
          "AND",
          ["internalid", "anyof", poId],
          "AND",
          ["custcol_mit_alocted_budget", "anyof", budgetFund],
        ],
        columns: [
          { name: "mainline", label: "*" },
          { name: "amount", label: "Amount" },
        ],
      };

      var result = util.getSearch(
        searchObj.type,
        searchObj.filters,
        searchObj.columns
      );
      if (result.length <= 0) {
        return false;
      }
      return result;
    } catch (error) {
      log.error("Error in PR search", error.message);
    }
  }
  function getDataFromPO(currentRecord) {
    var lineCount = currentRecord.getLineCount({
      sublistId: "item",
    });
    log.debug("lineCount", lineCount);
    // prID = null;
    // if (Number(lineCount) > 0) {
    //   prID = currentRecord.getSublistValue({
    //     sublistId: "item",
    //     fieldId: "linkedorder",
    //     line: 0,
    //   });
    //   log.debug("prID", prID);
    // }
    // if (!prID) {
    //   //need to writeA function
    //   return false;
    // }

    var allocatedBudgetList = [];
    for (let i = 0; i < lineCount; i++) {
      var allocatedBudget = currentRecord.getSublistValue({
        sublistId: "item",
        fieldId: "custcol_mit_alocted_budget",
        line: i,
      });
      if (!allocatedBudgetList.includes(allocatedBudget)) {
        allocatedBudgetList.push(allocatedBudget);
      }
    }
    log.debug("requiredDataList", allocatedBudgetList);
    return { allocatedBudgetList: allocatedBudgetList };
    // var prGrouped = groupBy(requiredData, "custcol_mit_alocted_budget");
  }
  function getNoneOfPOsearch(poID, budgetFund) {
    try {
      var searchObj = {
        type: "purchaseorder",
        filters: [
          ["type", "anyof", "PurchOrd"],
          "AND",
          ["internalid", "noneof", poID],
          "AND",
          ["custcol_mit_alocted_budget", "anyof", budgetFund],
        ],
        columns: [
          { name: "mainline", label: "*" },
          { name: "amount", label: "Amount" },
        ],
      };

      var result = util.getSearch(
        searchObj.type,
        searchObj.filters,
        searchObj.columns
      );
      if (result.length <= 0) {
        return false;
      }
      return result;
    } catch (error) {
      log.error("Error in PR search", error.message);
    }
  }
  function groupBy(arr, key) {
    var groupedObj = {};
    for (let i = 0; i < arr.length; i++) {
      var objKey = arr[i][key];
      if (groupedObj[objKey]) {
        groupedObj[objKey].push(arr[i]);
      } else {
        groupedObj[objKey] = [];
        groupedObj[objKey].push(arr[i]);
      }
    }
    return groupedObj;
  }
  function getPRlinkedSearch(budgetID) {
    var searchObj = {
      type: "transaction",
      filters: [
        ["type", "anyof", "PurchReq"],
        "AND",
        ["custcol_mit_alocted_budget", "anyof", budgetID],
      ],
      columns: [
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "amount", label: "Amount" },
        { name: "recordtype", label: "Record Type" },
      ],
    };
    return util.getSearch(searchObj.type, searchObj.filters, searchObj.columns);
  }
  function getPOlinkedSearch(budgetID) {
    var searchObj = {
      type: "transaction",
      filters: [
        ["type", "anyof", "PurchOrd"],
        "AND",
        ["custcol_mit_alocted_budget", "anyof", budgetID],
      ],
      columns: [
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "amount", label: "Amount" },
        { name: "recordtype", label: "Record Type" },
      ],
    };
    return util.getSearch(searchObj.type, searchObj.filters, searchObj.columns);
  }
  function getVClinkedSearch(budgetID) {
    var searchObj = {
      type: "transaction",
      filters: [
        ["type", "anyof", "VendCred"],
        "AND",
        ["custcol_mit_alocted_budget", "anyof", budgetID],
      ],
      columns: [
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "amount", label: "Amount" },
        { name: "recordtype", label: "Record Type" },
      ],
    };
    return util.getSearch(searchObj.type, searchObj.filters, searchObj.columns);
  }
  function getAllsearches(budgetList) {
    for (let i = 0; i < budgetList.length; i++) {
      var budgetId = budgetList[i];
      var VCSearch = getVClinkedSearch(budgetId);
      var POsearch = getPOlinkedSearch(budgetId);
      var PRsearch = getPRlinkedSearch(budgetId);
      log.debug("VCSearch", VCSearch);
      log.debug("POsearch", POsearch);
      log.debug("PRsearch", PRsearch);
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
    afterSubmit: afterSubmit,
  };
});

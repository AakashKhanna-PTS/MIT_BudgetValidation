/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
define(["SuiteScripts/pts_helper", "N/record"], function (util, record) {
  function afterSubmit(context) {
    try {
      var currentRecord = context.newRecord;
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
  function getTotalConsumedAmount(allocatedBudgetList) {
    try {
      var budgetFundTotal = {};
      for (let i = 0; i < allocatedBudgetList.length; i++) {
        var budgetId = allocatedBudgetList[i];
        var expenseList = getExpenseConsumedAmountSearch(budgetId);
        var reqisitionList = getPRconsumedAmountSearch(budgetId);
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

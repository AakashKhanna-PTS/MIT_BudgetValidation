define(["SuiteScripts/pts_helper", "N/record"], function (util, record) {
  function updateBudget(budgetId) {
    try {
      var totalConsumedBudget = getPoPrBillVcAmount(budgetId);
      var totalExpenseBudget = getTotalExpenseAmount(budgetId);
      var totalJournalBudget = getTotalJournalAmount(budgetId);
      log.debug("TotalExpenseBudget", totalExpenseBudget);
      log.debug("totalJournalBudget", totalJournalBudget);
      var newConsumedAmount =
        totalExpenseBudget + totalConsumedBudget + totalJournalBudget;
      log.debug("NewConsumedAmount", newConsumedAmount);
      if (newConsumedAmount < 0) {
        newConsumedAmount = 0;
      }
      var id = record.submitFields({
        type: "customrecord_pts_mit_budgetfunds",
        id: budgetId,
        values: {
          custrecord_pts_mit_consumedamnt: Math.round(newConsumedAmount),
        },
      });
      log.debug("Updated Successfully", id);
    } catch (error) {
      log.error("Error in suitelet", error.message);
    }
  }
  function getPoPrBillVcAmount(budgetId) {
    var VCSearch = getVClinkedSearch(budgetId);
    var billsearch = getBilllinkedSearch(budgetId);
    var POsearch = getPOlinkedSearch(budgetId);
    var PRsearch = getPRlinkedSearch(budgetId);
    log.debug("VCSearch", VCSearch);
    log.debug("billsearch", billsearch);
    log.debug("POsearch", POsearch);
    log.debug("PRsearch", PRsearch);

    // var vcGroup = groupBy(vcList, "linked");
    // var billGroupDeduct = groupBy(billList, "recordType");
    // var billBalance = reduceTheAmount(vcGroup, billGroupDeduct);

    // var billGroup = groupBy(billSearch, "linked");
    // var poGroup1 = groupBy(poSearch, "recordType");
    // var poBalance = reduceTheAmount(billGroup, poGroup1);

    var vcTotal = getTotal(VCSearch);
    log.debug("VCTOTal", vcTotal);
    var billDifference = findDifference(VCSearch, billsearch);
    var POdifference = findDifference(billsearch, POsearch);
    var PRdifference = findDifference(POsearch, PRsearch);
    var finalConsumedBudget =
      vcTotal +
      billDifference.addAmount +
      (billDifference.nonLinkedTotal - POdifference.addAmount) +
      POdifference.addAmount +
      (POdifference.nonLinkedTotal - PRdifference.addAmount) +
      PRdifference.addAmount +
      PRdifference.nonLinkedTotal;
    var totalAmountToReduce =
      billDifference.difference +
      POdifference.difference +
      PRdifference.difference;

    log.debug("billDifference", billDifference);
    log.debug("podifference", POdifference);
    log.debug("prDifference", PRdifference);
    log.debug("totalAmountToReduce", totalAmountToReduce);
    log.debug("FinalConsumedAMount", finalConsumedBudget);
    return finalConsumedBudget;
  }
  function findDifference(child, parent) {
    var Group1 = groupBy(child, "appliedtotransaction");
    var Group2 = groupBy(parent, "id");
    log.debug("poGroup", Group1);
    log.debug("prGroup", Group2);
    var balance = reduceTheAmount(Group1, Group2);
    var linkedIds = balance.linkedIds;
    var difference = balance.reduceAmount;
    var addAmount = balance.addAmount;
    var nonLinkedTotal = getnonLinkedValue(linkedIds, Group2);
    return {
      difference: difference,
      nonLinkedTotal: nonLinkedTotal,
      addAmount: addAmount,
    };
  }
  function getTotalJournalAmount(budgetId) {
    var expenseReportList = getJournalAmountSearch(budgetId);
    log.debug("JounalEntryu", expenseReportList);
    if (!expenseReportList) {
      return 0;
    }
    var sum = 0;
    for (let i = 0; i < expenseReportList.length; i++) {
      var expenseObj = expenseReportList[i];
      if (Number(expenseObj.amount) < 0) continue;
      sum += Number(expenseObj.amount);
    }
    return sum;
  }
  function getTotalExpenseAmount(budgetId) {
    var expenseReportList = getExpenseConsumedAmountSearch(budgetId);
    if (!expenseReportList) {
      return 0;
    }
    var sum = 0;
    for (let i = 0; i < expenseReportList.length; i++) {
      var expenseObj = expenseReportList[i];
      sum += Number(expenseObj.amount);
    }
    return sum;
  }
  function getJournalAmountSearch(budgetFund) {
    try {
      var searchObj = {
        type: "journalentry",
        filters: [
          ["type", "anyof", "Journal"],
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
  function getPRlinkedSearch(budgetID) {
    var searchObj = {
      type: "transaction",
      filters: [
        ["type", "anyof", "PurchReq"],
        "AND",
        ["custcol_mit_alocted_budget", "anyof", budgetID],
        "AND",
        ["appliedtotransaction.type", "noneof", "ItemRcpt"],
      ],
      columns: [
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        {
          name: "formulacurrency",
          formula:
            "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})      WHEN {type} = 'Requisition' THEN {estimatedamount} ELSE {fxamount}END",
          label: "Amount",
        },
        // {
        //   name: "formulacurrency",
        //   formula:
        //     "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})     ELSE {fxamount}END",
        //   label: "Amount",
        // },
        { name: "approvalstatus", label: "Approval Status" },
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
        "AND",
        ["appliedtotransaction.type", "noneof", "ItemRcpt"],
      ],
      columns: [
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        {
          name: "formulacurrency",
          formula:
            "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})      WHEN {type} = 'Requisition' THEN {estimatedamount} ELSE {fxamount}END",
          label: "Amount",
        },
        // {
        //   name: "formulacurrency",
        //   formula:
        //     "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})     ELSE {fxamount}END",
        //   label: "Amount",
        // },
        { name: "approvalstatus", label: "Approval Status" },
      ],
    };
    return util.getSearch(searchObj.type, searchObj.filters, searchObj.columns);
  }
  function getBilllinkedSearch(budgetID) {
    var searchObj = {
      type: "transaction",
      filters: [
        ["type", "anyof", "VendBill"],
        "AND",
        ["custcol_mit_alocted_budget", "anyof", budgetID],
        "AND",
        ["appliedtotransaction.type", "noneof", "ItemRcpt"],
      ],
      columns: [
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        {
          name: "formulacurrency",
          formula:
            "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})      WHEN {type} = 'Requisition' THEN {estimatedamount} ELSE {fxamount}END",
          label: "Amount",
        },
        // {
        //   name: "formulacurrency",
        //   formula:
        //     "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})     ELSE {fxamount}END",
        //   label: "Amount",
        // },
        { name: "approvalstatus", label: "Approval Status" },
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
        "AND",
        ["appliedtotransaction.type", "noneof", "ItemRcpt"],
      ],
      columns: [
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        { name: "appliedtotransaction", label: "Applied To Transaction" },
        { name: "recordtype", label: "Record Type" },
        { name: "custcol_mit_alocted_budget", label: "Allocated Budget" },
        {
          name: "formulacurrency",
          formula:
            "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})      WHEN {type} = 'Requisition' THEN {estimatedamount} ELSE {fxamount}END",
          label: "Amount",
        },
        // {
        //   name: "formulacurrency",
        //   formula:
        //     "CASE WHEN {type} = 'Bill' THEN ABS({fxamount})     ELSE {fxamount}END",
        //   label: "Amount",
        // },
        { name: "approvalstatus", label: "Approval Status" },
      ],
    };
    return util.getSearch(searchObj.type, searchObj.filters, searchObj.columns);
  }
  function getnonLinkedValue(linkedIds, prGroup) {
    var nonLinkedSum = 0;
    for (key in prGroup) {
      if (linkedIds.includes(key)) continue;
      nonLinkedSum += prGroup[key];
    }
    return nonLinkedSum;
  }
  function reduceTheAmount(child, parent) {
    var sum = 0;
    var childGrater = 0;
    var linkedIds = [];
    for (let key in child) {
      if (key == "NonLinked") {
        continue;
      }
      if (!parent[key]) {
        parent[key] = 0;
      } else {
        linkedIds.push(key);
      }
      // if (child[key] < 0) {
      //   child[key] *= -1;
      // }
      log.debug("PRkey", parent[key]);
      log.debug("POkey", child[key]);
      var calc = parent[key] - child[key];
      if (calc > 0) {
        sum += calc;
      }
      if (calc < 0) {
        childGrater += calc * -1;
      }
    }

    return { linkedIds: linkedIds, reduceAmount: sum, addAmount: childGrater };
  }
  function groupBy(arr, key) {
    var groupedObj = {};
    for (let i = 0; i < arr.length; i++) {
      var obj = arr[i];
      if (obj.approvalstatus == "3") continue;
      var objKey = arr[i][key];
      if (objKey == "") {
        objKey = "NonLinked";
      }
      if (groupedObj[objKey]) {
        groupedObj[objKey] += Number(arr[i].formulacurrency_6);
      } else {
        groupedObj[objKey] = 0;
        groupedObj[objKey] += Number(arr[i].formulacurrency_6);
      }
    }
    return groupedObj;
  }
  function getTotal(recList) {
    var sum = 0;
    for (let i = 0; i < recList.length; i++) {
      if (recList[i].approvalstatus == "3") continue;
      sum += Number(recList[i].formulacurrency_6);
    }
    return sum;
  }
  return {
    updateBudget: updateBudget,
  };
});

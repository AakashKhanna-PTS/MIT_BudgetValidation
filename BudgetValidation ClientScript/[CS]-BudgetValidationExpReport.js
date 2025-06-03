/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */
const BUDGET_ACCOUNT_GROUP_NOT_AVAILABLE = 11;
const BUDGET_EXCEEDED = 6;
const BUDGET_NOT_APPLICABLE = 12;
const BUDGET_VALIDATION_WITHIN_BUDGET = 5;
const MATCHING_BUDGET_NOT_AVAILABLE = 7;
const SUBLIST_ID = "expense";

define(["SuiteScripts/pts_helper", "N/search", "N/record"], function (
  util,
  search,
  record
) {
  //Using pageInit to make the neccessary fields Mandatory.
  function pageInit(context) {
    try {
      var CurrentRecord = context.currentRecord;
      var categoryLine = CurrentRecord.getSublist({
        sublistId: SUBLIST_ID,
      });
      //add the all the neccessary fields in the Array

      var mandatoryFields = ["category", "department", "class"];
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
  //validates the budget combination while adding a line.
  function validateLine(context) {
    try {
      var currentRecord = context.currentRecord;
      var sublistField = context.sublistId;
      if (sublistField != SUBLIST_ID) return;
      var errorMessages = [];
      var currentDate = currentRecord.getValue("trandate");
      var requiredFields = {
        category: null,
        department: null,
        class: null,
        location: null,
      };

      for (let key in requiredFields) {
        var value = currentRecord.getCurrentSublistValue({
          sublistId: SUBLIST_ID,
          fieldId: key,
        });
        requiredFields[key] = value;
        if (key == "location") {
          continue;
        }
        if (!_logValidation(value)) {
          var line = currentRecord.getCurrentSublistValue({
            sublistId: SUBLIST_ID,
            fieldId: "line",
          });
          errorMessages.push({
            success: false,
            message: `in line: ${line}${key} does not hold any Value`,
          });
        }
      }
      log.debug("ErrorMessages", errorMessages);
      if (errorMessages.length > 0) {
        var alertString = "";
        for (let i = 0; i < errorMessages.length; i++) {
          alertString += `${errorMessages[i].message}  \n`;
        }
        alert(alertString);
        return false;
      }

      //This field value was not available so loading the record
      var expenseRecord = record.load({
        type: "expensecategory",
        id: requiredFields.category,
      });
      var expenseAccount = expenseRecord.getValue("expenseacct");

      //..........
      requiredFields.expenseAccount = expenseAccount;
      //Checks whether the combination exists..
      var budgetRecord = validCombination(requiredFields);

      setBudgetWarning(budgetRecord, currentRecord);
      ///...
      log.debug("budgetRecord", budgetRecord);
      //Functino that sets The warning budget values
      //........
      if (!budgetRecord) {
        alert("the budget combination does not exisit");
        return false;
      }
      var validFinacialBudget = getValidYearBudget(budgetRecord, currentDate);
      log.debug("validFinanvialBudget", validFinacialBudget);
      if (!validFinacialBudget) {
        alert("The Budget combination financial year is expired");
        return false;
      }
      var validLocation = validateLocation(requiredFields, validFinacialBudget);
      if (!validLocation) {
        alert("The location is not valid");
        return false;
      }

      return true;
    } catch (error) {
      log.error("Error in ValidateLine", error.message);
    }
  }

  //sets all the necessary data and validates the record while saving
  function saveRecord(context) {
    try {
      var currentRecord = context.currentRecord;
      var lineCount = currentRecord.getLineCount({
        sublistId: SUBLIST_ID,
      });
      var currentDate = currentRecord.getValue("trandate");
      //GroupedBudget is used in a below function to group the consumed amount as per different budget funds
      var groupedBudget = {};
      for (var i = 0; i < lineCount; i++) {
        var errorMessages = [];
        var requiredFields = {
          category: null,
          department: null,
          class: null,
        };
        var alerrtSting = "";
        for (let key in requiredFields) {
          var value = currentRecord.getSublistValue({
            sublistId: SUBLIST_ID,
            fieldId: key,
            line: i,
          });
          if (!_logValidation(value)) {
            alerrtSting += `   ${key} does not hold any Value \n`;
          }
          requiredFields[key] = value;
        }
        if (alerrtSting != "") {
          errorMessages.push({
            line: i + 1,
            message: alerrtSting,
          });
        }

        log.debug("ErrorMessages", errorMessages);
        if (errorMessages.length > 0) {
          var alertString = "";
          for (let i = 0; i < errorMessages.length; i++) {
            alertString += `Line ${errorMessages[i].line} shows :\n${errorMessages[i].message}`;
          }
          alert(alertString);
          return false;
        }
        //Loading the record because, not able to get it through search.
        var expenseRecord = record.load({
          type: "expensecategory",
          id: requiredFields.category,
        });
        var expenseAccount = expenseRecord.getValue("expenseacct");
        //Pushing the expenseAcccount to the requiredFields object for further use

        requiredFields.expenseAccount = expenseAccount;
        var budgetRecord = validCombination(requiredFields);
        log.debug("budgetRecord", budgetRecord);
        if (!budgetRecord) {
          alert("the budget combination does not exisit");
          return false;
        }
        var validFinacialBudget = getValidYearBudget(budgetRecord, currentDate);
        if (!validFinacialBudget) {
          alert("The Budget combination financial year is expired");
          return false;
        }
        //Function that fetches an object that holds all the necessary values to poplulate
        //Uses the above mentioned groupedBuget Object to group values
        var populateFields = getFieldsToPopulate(
          currentRecord,
          i,
          validFinacialBudget,
          expenseAccount,
          groupedBudget
        );
        //Function to set the fetched object values in line
        setBudgetFields(currentRecord, i, populateFields);
      }
      //For loop validates the record if it holds exceeding budget
      let budgetExceededSum = [];
      let sum = 0;
      for (var i = 0; i < lineCount; i++) {
        var value = currentRecord.getSublistValue({
          sublistId: SUBLIST_ID,
          fieldId: "custcol_pts_ocr_budgetexcidngamnt",
          line: i,
        });
        log.debug("ValueExceeding", value);
        if (Number(value) > 0) {
          sum += Number(value);
          budgetExceededSum.push({ line: i + 1, value: value });
        }
      }
      currentRecord.setValue("custbody_pts_ocr_budgetexcededamont", sum);
      var date = currentRecord.getValue("trandate");
      log.debug("date", date);
      currentRecord.setValue("custbody_pts_ocr_budgetvaldtddate", new Date());
      var alertString = "";
      if (budgetExceededSum.length > 0) {
        for (let i = 0; i < budgetExceededSum.length; i++) {
          alertString += `Budget exceeding value of ${budgetExceededSum[i].value} in Line ${budgetExceededSum[i].line} \n`;
        }
        log.debug("alerrtSting", alertString);
        currentRecord.setValue(
          "custbody_pts_mit_budgetstatus",
          BUDGET_EXCEEDED
        );
        alert(alertString);
        return false;
      }
      //If all validation passes it lets you save the record
      currentRecord.setValue(
        "custbody_pts_mit_budgetstatus",
        BUDGET_VALIDATION_WITHIN_BUDGET
      );
      return true;
    } catch (error) {
      log.error("Error in saveRecord", error.message);
    }
  }

  //All the used secondry funtions are mentioned below...
  function getValidYearBudget(budgetRecord, currentDate) {
    for (let i = 0; i < budgetRecord.length; i++) {
      var dateRange = budgetRecord[i].custrecord_pts_mit_bdgt_fy_txt;
      var validateDate = validateYearRange(currentDate, dateRange);
      if (validateDate) {
        return budgetRecord[i];
      }
    }
    return false;
  }
  function setBudgetWarning(budgetRecord, currentRecord) {
    if (!budgetRecord) {
      currentRecord.setCurrentSublistValue({
        sublistId: SUBLIST_ID,
        fieldId: "custcol_pts_ocr_budgetwrnig",
        value: "Budget combination does not exisit",
      });
    } else {
      currentRecord.setCurrentSublistValue({
        sublistId: SUBLIST_ID,
        fieldId: "custcol_pts_ocr_budgetwrnig",
        value: "",
      });
    }
  }
  function validateFinancialYear(dateToCheck, startDate, endDate) {
    const checkDate = new Date(dateToCheck);
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Validate the dates
    if (isNaN(checkDate) || isNaN(start) || isNaN(end)) {
      throw new Error("Invalid date(s) provided.");
    }

    // Extract years
    const checkYear = checkDate.getFullYear();
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    // Check if year is within the range
    return checkYear >= startYear && checkYear < endYear;
  }
  function validateYearRange(dateToCheck, yearRange) {
    // Validate the format using a regular expression
    const match = yearRange.match(/^(\d{4})-(\d{4})$/);

    if (!match) {
      throw new Error("Invalid year range format. Expected 'YYYY-YYYY'.");
    }

    // Extract and convert the years to numbers
    const startYear = parseInt(match[1], 10);
    const startYearStr = startYear.toString();
    const endYear = parseInt(match[2], 10);
    const endYearStr = endYear.toString();
    return validateFinancialYear(dateToCheck, startYearStr, endYearStr);
  }
  function validateLocation(requiredFields, budgetRecord) {
    var budgetFields = budgetRecord;
    if (!_logValidation(budgetFields.custrecord_pts_mit_bdgt_location)) {
      return true;
    }
    if (
      requiredFields.location == budgetFields.custrecord_pts_mit_bdgt_location
    ) {
      return true;
    }
    return false;
  }
  function validCombination(requiredFields) {
    try {
      var searchObj = {
        type: "customrecord_pts_mit_budgetfunds",
        filters: [
          ["custrecord_pts_mit_bdgt_class", "anyof", requiredFields.class],
          "AND",
          ["custrecord_pts_mit_costcenter", "anyof", requiredFields.department],
          "AND",
          [
            "custrecord_pts_mit_bdgtaccgeup.custrecord_pts_mit_acc",
            "anyof",
            requiredFields.expenseAccount,
          ],
          "AND",
          ["isinactive", "is", "F"],
        ],
        columns: [
          {
            name: "custrecord_pts_mit_bdgtaccgeup",
            label: "Budget Account Group",
          },
          {
            name: "custrecord_pts_mit_costcenter",
            label: "Cost Center",
          },
          {
            name: "custrecord_pts_mit_bdgt_class",
            label: "Department / School",
          },
          {
            name: "custrecord_pts_mit_bdgt_location",
            label: "location",
          },
          { name: "custrecord_pts_mit_bdgt_amt", label: "Budget Amount" },
          { name: "custrecord_pts_mit_consumedamnt", label: "Consumed Amount" },
          { name: "custrecord_pts_mit_bdgt_fy", label: "Financial Year" },
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
      log.error("Error in seachValidteCombination", error.message);
    }
  }

  function getFieldsToPopulate(
    currentRecord,
    line,
    budgetRecord,
    expenseAccount,
    groupedBudget
  ) {
    var populateFields = {
      custcol_pts_ocr_budgetamount: null,
      custcol_pts_ocr_budgetconsumdamnt: null,
      custcol_pts_ocr_budgetexcidngamnt: null,
      custcol_pts_mit_bdgt_ac_grp_line: null,
      custcol_mit_alocted_budget: null,
      custcol_ocr_bdgt_itms_ac: null,
      custcol_ptc_ocr_segment_on_budget: null,
    };

    var budgetRecordFields = budgetRecord;
    var budgetId = budgetRecordFields.id;

    var currentAmount = currentRecord.getSublistValue({
      sublistId: SUBLIST_ID,
      fieldId: "amount",
      line: line,
    });
    if (groupedBudget[budgetId]) {
      groupedBudget[budgetId] += Number(currentAmount);
    } else {
      groupedBudget[budgetId] = 0;
      var sum =
        Number(currentAmount) +
        Number(budgetRecordFields.custrecord_pts_mit_consumedamnt);
      groupedBudget[budgetId] += sum;
    }
    var consumedAmount = groupedBudget[budgetId];
    var exceedingAmount = getExceedingAmount(
      consumedAmount,
      budgetRecordFields
    );
    var budgetSegment = getSegments(budgetRecordFields);
    populateFields.custcol_pts_ocr_budgetamount =
      budgetRecordFields.custrecord_pts_mit_bdgt_amt;
    populateFields.custcol_pts_ocr_budgetconsumdamnt = consumedAmount;
    populateFields.custcol_pts_ocr_budgetexcidngamnt = exceedingAmount;
    populateFields.custcol_pts_mit_bdgt_ac_grp_line =
      budgetRecordFields.custrecord_pts_mit_bdgtaccgeup;
    populateFields.custcol_mit_alocted_budget = budgetRecordFields.id;
    populateFields.custcol_ocr_bdgt_itms_ac = expenseAccount;
    populateFields.custcol_ptc_ocr_segment_on_budget = budgetSegment;
    return populateFields;
  }
  function setBudgetFields(currentRecord, line, populateFields) {
    currentRecord.selectLine({
      sublistId: SUBLIST_ID,
      line: line,
    });
    for (key in populateFields) {
      currentRecord.setCurrentSublistValue({
        sublistId: SUBLIST_ID,
        fieldId: key,
        value: populateFields[key],
      });
    }
    currentRecord.commitLine({
      sublistId: SUBLIST_ID,
    });
  }
  function getExceedingAmount(currentAmount, budgetRecord) {
    var expenseAmount = Number(currentAmount);
    var availableBudget = Number(budgetRecord.custrecord_pts_mit_bdgt_amt);
    var exceedingAmount = availableBudget - expenseAmount;
    if (exceedingAmount < 0) {
      return exceedingAmount * -1;
    }
    return 0;
  }
  function getSegments(applicableLine) {
    let prioritySeq = 0;

    var getlineclass = applicableLine.custrecord_pts_mit_bdgt_class; // D/S
    var getLineCC = applicableLine.custrecord_pts_mit_costcenter; // CC
    var getLineLocation = applicableLine.custrecord_pts_mit_bdgt_location; // L

    if (getlineclass && getLineCC && getLineLocation) {
      prioritySeq = 102; // All three values are available
    } else if (getlineclass && getLineCC) {
      prioritySeq = 101; // D/S and CC are available
    } else if (getlineclass && getLineLocation) {
      prioritySeq = 2; // D/S and L are available
    } else if (getlineclass) {
      prioritySeq = 1; // Only D/S is available
    }

    return prioritySeq;
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
    saveRecord: saveRecord,
  };
});

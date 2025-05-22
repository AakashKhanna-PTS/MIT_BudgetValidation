/**
 *@NApiVersion 2.1
 *@NScriptType ClientScript
 */

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
          sublistId: "expense",
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
    function validateLine(context) {
      try {
        var currentRecord = context.currentRecord;
        var sublistField = context.sublistId;
        if (sublistField != "expense") return;
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
            sublistId: "expense",
            fieldId: key,
          });
          requiredFields[key] = value;
          if (key == "location") {
            continue;
          }
          if (!_logValidation(value)) {
            errorMessages.push({
              success: false,
              message: `${key} does not hold any Value`,
            });
          }
        }
        log.debug("ErrorMessages", errorMessages);
        if (errorMessages.length > 0) return false;
  
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
        log.debug("budgetRecord", budgetRecord);
        //Functino that sets The warning budget values
        //........
        if (!budgetRecord) {
          alert("the budget combination does not exisit");
          return false;
        }
  
        var validLocation = validateLocation(requiredFields, budgetRecord);
        var dateRange = budgetRecord[0].custrecord_pts_mit_bdgt_fy_txt;
        var validateDate = validateYearRange(currentDate, dateRange);
  
        if (!validLocation) {
          alert("The location is not valid");
          return false;
        }
        if (!validateDate) {
          alert("The Budget combination financial year is expired");
          return false;
        }
        return true;
      } catch (error) {
        log.error("Error in ValidateLine", error.message);
      }
    }
  
    function saveRecord(context) {
      try {
        var currentRecord = context.currentRecord;
        var lineCount = currentRecord.getLineCount({
          sublistId: "expense",
        });
        var groupedBudget = {};
        for (var i = 0; i < lineCount; i++) {
          var errorMessages = [];
          var requiredFields = {
            category: null,
            department: null,
            class: null,
            // location: null,
          };
          for (let key in requiredFields) {
            var value = currentRecord.getSublistValue({
              sublistId: "expense",
              fieldId: key,
              line: i,
            });
            if (!_logValidation(value)) {
              errorMessages.push({
                success: false,
                message: `${key} does not hold any Value`,
              });
            }
            requiredFields[key] = value;
          }
          log.debug("ErrorMessages", errorMessages);
          if (errorMessages.length > 0) return true;
  
          var expenseRecord = record.load({
            type: "expensecategory",
            id: requiredFields.category,
          });
          var expenseAccount = expenseRecord.getValue("expenseacct");
          //..........
          requiredFields.expenseAccount = expenseAccount;
          var budgetRecord = validCombination(requiredFields);
  
          if (!budgetRecord) {
            continue;
          }
          // setBudgetWarning(budgetRecord, currentRecord, i);
          
          var populateFields = getFieldsToPopulate(
            currentRecord,
            i,
            budgetRecord,
            expenseAccount,
            groupedBudget,
          );
            log.debug("groupedBudget",groupedBudget)
          setBudgetFields(currentRecord, i, populateFields);
        }
        for (var i = 0; i < lineCount; i++) {
          var value = currentRecord.getSublistValue({
            sublistId: "expense",
            fieldId: "custcol_pts_ocr_budgetexcidngamnt",
            line: i,
          });
          if (value > 0) {
            alert("This record is exceeding the budget");
            return false;
          }
        }
        return true;
      } catch (error) {
        log.error("Error in saveRecord", error.message);
      }
    }
    function validateFinancialYear(dateToCheck, startDate, endDate) {
      const checkDate = new Date(dateToCheck);
      const start = new Date(startDate);
      const end = new Date(endDate);
      log.debug("checkYear1", checkDate);
      log.debug("startYear2", start);
      log.debug("endYear3", end);
      // Validate the dates
      if (isNaN(checkDate) || isNaN(start) || isNaN(end)) {
        throw new Error("Invalid date(s) provided.");
      }
  
      // Extract years
      const checkYear = checkDate.getFullYear();
      const startYear = start.getFullYear();
      const endYear = end.getFullYear();
      log.debug("checkYear", checkYear);
      log.debug("startYear", startYear);
      log.debug("endYear", endYear);
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
      log.debug("startDat-EndDate", `${startYear}-${endYear}`);
      return validateFinancialYear(dateToCheck, startYearStr, endYearStr);
    }
    function validateLocation(requiredFields, budgetRecord) {
      var budgetFields = budgetRecord[0];
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
    function setBudgetWarning(budgetRecord, currentRecord) {
      if (!budgetRecord) {
        currentRecord.setCurrentSublistValue({
          sublistId: "expense",
          fieldId: "custcol_pts_ocr_budgetwrnig",
          value: "Budget combination does not exisit",
        });
      } else {
        currentRecord.setCurrentSublistValue({
          sublistId: "expense",
          fieldId: "custcol_pts_ocr_budgetwrnig",
          value: "",
        });
      }
    }
    function getFieldsToPopulate(
      currentRecord,
      line,
      budgetRecord,
      expenseAccount,
      groupedBudget,
    ) {
      var populateFields = {
        custcol_pts_ocr_budgetamount: null,
        custcol_pts_ocr_budgetconsumdamnt: null,
        custcol_pts_ocr_budgetexcidngamnt: null,
        custcol_pts_mit_bdgt_ac_grp_line: null,
        custcol_mit_alocted_budget: null,
        custcol_ocr_bdgt_itms_ac: null,
      };
  
      var budgetRecordFields = budgetRecord[0];
      var budgetId = budgetRecordFields.id;
  
      var currentAmount = currentRecord.getSublistValue({
        sublistId: "expense",
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
      // if (groupedBudget[budgetId]) {
      //   var length = groupedBudget[budgetId].length;
      //   groupedBudget[budgetId].push({
      //     consumedAmount:
      //       groupedBudget[budgetId][length - 1].consumedAmount +
      //       Number(currentAmount),
      //   });
      // } else {
      //   groupedBudget[budgetId] = [];
      //   groupedBudget[budgetId].push({
      //     consumedAmount:
      //       Number(currentAmount) +
      //       Number(budgetRecordFields.custrecord_pts_mit_consumedamnt),
      //   });
      // }
      // log.debug("groupedObj", groupedBudget);
      // var consumedAmount =
      //   Number(currentAmount) +
      //   Number(budgetRecordFields.custrecord_pts_mit_consumedamnt);
      // if (line > 0) {
      //   var currentConsumedAmount = currentRecord.getSublistValue({
      //     sublistId: "expense",
      //     fieldId: "custcol_pts_ocr_budgetconsumdamnt",
      //     line: line - 1,
      //   });
      //   consumedAmount = Number(currentAmount) + Number(currentConsumedAmount);
      // }
      // var consumedAmountList = groupedBudget[budgetId];
      // var consumedAmount =
      //   consumedAmountList[consumedAmountList.length - 1].consumedAmount;
        var consumedAmount = groupedBudget[budgetId];
      var exceedingAmount = getExceedingAmount(
        consumedAmount,
        budgetRecordFields
      );
  
      populateFields.custcol_pts_ocr_budgetamount =
        budgetRecordFields.custrecord_pts_mit_bdgt_amt;
      populateFields.custcol_pts_ocr_budgetconsumdamnt = consumedAmount;
      populateFields.custcol_pts_ocr_budgetexcidngamnt = exceedingAmount;
      populateFields.custcol_pts_mit_bdgt_ac_grp_line =
        budgetRecordFields.custrecord_pts_mit_bdgtaccgeup;
      populateFields.custcol_mit_alocted_budget = budgetRecordFields.id;
      populateFields.custcol_ocr_bdgt_itms_ac = expenseAccount;
      return populateFields;
    }
    function setBudgetFields(currentRecord, line, populateFields) {
      currentRecord.selectLine({
        sublistId: "expense",
        line: line,
      });
      for (key in populateFields) {
        currentRecord.setCurrentSublistValue({
          sublistId: "expense",
          fieldId: key,
          value: populateFields[key],
        });
      }
      currentRecord.commitLine({
        sublistId: "expense",
      });
    }
    function getExceedingAmount(currentAmount, budgetRecord) {
      var expenseAmount = Number(currentAmount);
  
      var availableBudget = Number(budgetRecord.custrecord_pts_mit_bdgt_amt);
      log.debug("currentAmount", expenseAmount);
  
      log.debug("availableBudget", availableBudget);
      var exceedingAmount = availableBudget - expenseAmount;
      if (exceedingAmount < 0) {
        return exceedingAmount * -1;
      }
      log.debug("exceedingAMount", exceedingAmount);
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
  
/**
 *@NApiVersion 2.x
 *@NScriptType Suitelet
 */
//GLOBALS FOR HELPER FN
var SEARCH,
  RECORD,
  RUNTIME,
  MOMENT,
  LOG_TYPE,
  TAG,
  MODE,
  CURRENT_RECORD,
  MESSAGE,
  logger;
//GLOBALS FOR VALIDATION
var ITEM_LIST,
  EXPENSE_LIST,
  BACK_TRACK,
  FUND_CENTER_LIST,
  RELEASE_LIST,
  OLD_DATE;
var ITEM_LINES_REM_FLG, EXP_LINES_REM_FLG, LOCATION_LIST;
var EXCHANGE_RATE, CURRENCY, OLD_CURRENCY, OLD_EXCHANGE_RATE;
var PREV_VALUES_TABLE = [];
//changes for PO ->BILL
var PO_DATA = [];
var REQ_PO_LINES = [];
var CNVRT_FROM_PO = false;
const INR = 1;
var CUR_REC;
const EXCLUDE_VENDORS = ["15", "16", "17", "18", "19"]
define([
  "N/runtime",
  "N/search",
  "N/record",
  "SuiteScripts/moment",
  "N/redirect",
  "SuiteScripts/budgets/Helper/pts_table_gen"
], function (runtime, search, record, moment, redirect, tableGen) {

  function onRequest(context) {
    try {
      if (context.request.method == "GET") {
        var rec_id = context.request.parameters.rec_id;
        var rec_type = context.request.parameters.rec_type;

        CUR_REC = record.load({
          type: rec_type,
          id: rec_id,
          isDynamic: true,
        });

        var entity = CUR_REC.getValue("entity");

        if (entity != "") {
          var isInExcludeList = EXCLUDE_VENDORS.filter(function (c) {
            if (c == entity) {
              return c;
            }
          });


          var isexclude = CUR_REC.getValue("custbody_cust_pts_pbl_budget_validatio");


          if (isInExcludeList.length > 0 || isexclude == true) {

            CUR_REC.setValue("custbody_validation_budget_pending", false);


            CUR_REC.setValue("custbody_budget_error", "");


            CUR_REC.save({
              ignoreMandatoryFields: true,
            });

            redirect.toRecord({
              type: CUR_REC.type,
              id: rec_id,
            });

            return 0;

          }
        }

        var isValPending = CUR_REC.getValue(
          "custbody_validation_budget_pending"
        );

        if (isValPending) {
          setEnv(context);
          updateGlobals(CUR_REC);
          updateOldBudgets();
          validateBudget(CUR_REC);

          var macros = CUR_REC.getMacros();

          if ('calculateTax' in macros) {

            macros.calculateTax();
          }

          var id = CUR_REC.save({
            ignoreMandatoryFields: true,
          });
        }
        redirect.toRecord({
          type: CUR_REC.type,
          id: rec_id,
        });
      }
    } catch (e) {
      showError("PAGE_INIT_FAILED", e);
      throw e;
    }
  }

  function validateBudget(curRec) {
    try {
      BACK_TRACK = [];
      RELEASE_LIST = [];
      var isItemValid = false;
      var isExpenseValid = false;

      var lineItems = getLineItems(curRec);

      //include the item details
      updatelineItems(lineItems, curRec);

      log.debug("lineitems", lineItems);
      //validate items

      var response = validateItems(curRec, lineItems);

      if (response.errors.length == 0) {
        //
        isItemValid = true;
        printWarnings(response.warning || []);
      } else {
        printErrors(response.errors);
      }

      var expenseItems = getExpenseList(curRec);

      updateExpenseLines(expenseItems, curRec);

      //validate expense
      var expResponse = validateExpense(curRec, expenseItems);
      if (expResponse.errors.length == 0) {
        isExpenseValid = true;
        printWarnings(expResponse.warning || []);
      } else {
        printErrors(expResponse.errors);
      }

      updateResponseToRecord(response, expResponse, curRec);

      if (isExpenseValid && isItemValid) {
        updateBudgets(curRec);
        handleFinancialYearChange(curRec, lineItems, expenseItems);
        handleLineRemoved(curRec, lineItems, expenseItems);
        releaseBudgets(curRec);
        updatePendingstatus(curRec, lineItems, expenseItems);
        return true;
      } else {
        return false;
      }
    } catch (e) {
      log.debug("main exception error", JSON.stringify(e));
      showError("SAVE RECORD ERROR", e);
      //throw e;
    }
  }

  function updatePendingstatus(curRec, lineItems, expenseItems) {
    var isPending = false;

    var res = lineItems.filter(function (c, j) {
      if (c.budval_pending) return c;
    });

    var expres = expenseItems.filter(function (c, j) {
      if (c.budval_pending) return c;
    });

    if (res.length > 0 || expres.length > 0) isPending = true;

    curRec.setValue("custbody_validation_budget_pending", isPending);

  }

  function handleLineRemoved(curRec, lineItems, expenseItems) {

    //obvious removal of lines
    if (MODE == "edit") {

      var item_line_count = curRec.getLineCount("item");
      if (item_line_count != ITEM_LIST.length || ITEM_LINES_REM_FLG) {


        for (var i = 0; i < ITEM_LIST.length; i++) {
          var oldline = ITEM_LIST[i];


          var current_line = lineItems.filter(function (c, j) {
            if (
              c.item == oldline.item &&
              c.custcol_line_unique_key == oldline.custcol_line_unique_key
            )
              return c;
          });

          if (current_line.length == 0) {

            log.debug("release line", oldline)
            RELEASE_LIST.push({
              budget: oldline.budget.id,
              oldLine: oldline,
            });

          }
        }
      }
      var expense_line_count = curRec.getLineCount("expense");

      if (expense_line_count != EXPENSE_LIST.length || EXP_LINES_REM_FLG) {
        for (var i = 0; i < EXPENSE_LIST.length; i++) {
          var oldline = EXPENSE_LIST[i];
          var current_line = expenseItems.filter(function (c, j) {
            if (
              c.account == oldline.account &&
              c.custcol_line_unique_key == oldline.custcol_line_unique_key
            )
              return c;
          });


          if (current_line.length == 0) {
            if (oldline.budget)
              RELEASE_LIST.push({
                budget: oldline.budget.id,
                oldLine: oldline,
              });
          }
        }
      }
    }

    //check if it is create and converted po
    if ((MODE == "create" || MODE == "copy") && CNVRT_FROM_PO == true) {
      log.debug("create", "line removed block")
      for (var i = 0; i < PO_DATA.length; i++) {
        var oldline = PO_DATA[i];

        var current_line = lineItems.filter(function (c, j) {
          if (
            c.item == oldline.item &&
            c.custcol_line_unique_key == oldline.custcol_line_unique_key
          )
            return c;
        });

        if (current_line.length > 0) {
          var current_line = current_line[0];
          if (!current_line.ignoreBudget) {
            log.debug("vb->current_line", current_line)

            if (
              current_line.fundCenter.custrecord_fund_center_list_name !=
              oldline.custcol_fund_center_pr ||
              current_line.commitmentItem.id != oldline.custcol_commitment_item_pr
            )
              RELEASE_LIST.push({
                budget: oldline.custcol_budget_line_level,
                oldLine: oldline,
              });
          }


        }
      }
    }

  }

  function releaseBudgets(rec) {
    var release_obj = [];

    for (var i = 0; i < RELEASE_LIST.length; i++) {
      var row = RELEASE_LIST[i];
      log.debug('release budget->line', row);
      if (row.hasOwnProperty("rem_qty")) {

        log.debug('if hasOwnProperty', row);

        release_obj.push({
          id: row.budget,
          amount: (row.oldLine.amount / row.oldLine.quantity) * toNum(row.rem_qty)
        });

      } else {

        log.debug('else hasOwnProperty', row);

        release_obj.push({
          id: row.budget,
          amount: row.oldLine.amount,
        });
      }
    }
    var group_budget = groupBy(release_obj, "id");
    log.debug('release->group_budget', group_budget);

    var final_data = [];
    for (var key in group_budget) {
      final_data.push({
        id: key,
        total: roundToTwo(sum(group_budget[key], "amount")) * -1,
      });
    }

    rec.setValue({
      fieldId: "custbody_budget_validate_ref",
      value: JSON.stringify({ utilised: BACK_TRACK, release: final_data }),
    });

    var budget_update_data = rec.getValue("custbody_budget_validate_ref");

    log.debug("final_data", budget_update_data);

  }

  function updateBudgets(rec) {
    rec.setValue({
      fieldId: "custbody_budget_validate_ref",
      value: JSON.stringify({ utilised: BACK_TRACK }),
    });
  }

  function validateItems(rec, lines) {
    var result = {
      errors: [],
      warning: [],
    };
    if (lines.length == 0) {
      return result;
    }
    var budgetResponse = getItemBudgets(rec, lines);
    if (budgetResponse.errors.length == 0) {
      for (var i = 0; i < lines.length; i++) {
        var line = i + 1;
        var row = lines[i];
        row.i = i;
        log.debug("---->vald for row:" + i, row.item);
        var oldline = {};
        if (row.type == "Discount" || row.ignoreBudget) continue;
        //check if old and current line closed so that we can skip this line
        if (MODE == "edit") {
          oldline = geOldSubLine("item", row.custcol_line_unique_key);
          if (oldline) {
            var financial_year = getFinancialyear(rec.getValue("trandate"));
            var old_financial_year = getFinancialyear(
              OLD_DATE || rec.getValue("trandate")
            );

            if (oldline && oldline.isclosed && row.isclosed) {
              log.debug("line is closed->skipping it", i);
              continue;
            }

            //release the budget if the there is a change in the close check box
            if (oldline && !oldline.isclosed && row.isclosed && financial_year == old_financial_year) {
              log.debug('else row->po->quantity', row.quantity);
              //consume the amount
              RELEASE_LIST.push({
                budget: row.budget.id,
                oldLine: oldline,
              });
              continue;
            }

            if (oldline.budget) {
              if (row.budget.id != oldline.budget.id && CNVRT_FROM_PO == false) {
                if (!oldline.isclosed && financial_year == old_financial_year)
                  RELEASE_LIST.push({
                    budget: oldline.budget.id,
                    oldLine: oldline,
                  });
              }
            }

          }
        }

        var amount = toNum(getLineAmount(rec, "item", row, lines));
        log.debug("item->amount", amount);
        var remaning_amount = toNum(getBudgetRemaining(row));
        log.debug("item->remaning_amount", remaning_amount);
        if (amount > remaning_amount) {
          row.budval_pending = true;
          var warning = getWarning(row, line, "item", amount);
          result.errors.push(warning);
          rec.selectLine({
            sublistId: "item",
            line: i,
          });

          rec.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "custcol_budget_validation_pending",
            value: true,
          });

          rec.commitLine({
            sublistId: "item",
          });

          if (oldline) {
            if (oldline.budget) {
              RELEASE_LIST.push({
                budget: oldline.budget.id,
                oldLine: oldline,
              });
            }

          }

          if (MODE == "edit") {
            clearCurrentItemLine(rec, i);
          }
          continue;
        } else {
          //do the remaining calc
          var rem = remaning_amount + amount;
          if (rem >= 0) {

            log.debug('prline:' + row.amount, row.prline);


            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: amount * -1,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount),
            });
          }

          var utilised_row = BACK_TRACK.filter(function (c) {
            if (c.id == row.budget.id) return c;
          });

          if (utilised_row.length > 0) utilised_row = utilised_row[0];

          rec.selectLine({
            sublistId: "item",
            line: i,
          });

          rec.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "custcol_fund_center_pr",
            value: row.fundCenter.custrecord_fund_center_list_name,
          });

          rec.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "custcol_commitment_item_pr",
            value: row.commitmentItem.id,
          });

          rec.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "custcol_budget_line_level",
            value: row.budget.id,
          });

          rec.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "custcol_amount_not_utilised",
            value: rem
          });

          rec.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "custcol_utilized_amount_001",
            value: toNum(utilised_row.utilised) + toNum(row.budget.custrecord_utilised_amount)
          });

          rec.setCurrentSublistValue({
            sublistId: "item",
            fieldId: "custcol_budget_validation_pending",
            value: false
          });

          rec.commitLine({
            sublistId: "item",
          });

        }

      }

      return result;
    } else {
      return budgetResponse;
    }
  }

  function clearCurrentItemLine(rec, i) {
    rec.selectLine({
      sublistId: "item",
      line: i,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_fund_center_pr",
      value: null,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_commitment_item_pr",
      value: null,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_budget_line_level",
      value: null,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_amount_not_utilised",
      value: 0,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_utilized_amount_001",
      value: 0,
    });

    rec.setCurrentSublistValue({
      sublistId: "item",
      fieldId: "custcol_budget_validation_pending",
      value: true,
    });

    rec.commitLine({
      sublistId: "item",
    });
  }


  function validateExpense(rec, lines) {
    var result = {
      errors: [],
      warning: [],
    };
    if (lines.length == 0) {
      return {
        errors: [],
        warning: [],
      };
    }
    var budgetResponse = getExpenseBudgets(rec, lines);

    if (budgetResponse.errors.length == 0) {
      for (var i = 0; i < lines.length; i++) {
        var line = i + 1;
        var row = lines[i];
        log.debug("expense line", row);
        //check if old and current line closed so that we can skip this line
        if (MODE == "edit") {
          var oldline = geOldSubLine("expense", row.custcol_line_unique_key);
          if (oldline && oldline.isclosed && row.isclosed) {
            log.debug("line is closed->skipping it", i);
            continue;
          }

          if (oldline && row.cseg_cost_centre != oldline.cseg_cost_centre) {
            if (!oldline.isclosed)
              RELEASE_LIST.push({
                budget: oldline.budget.id,
                oldLine: oldline,
              });
          }
        }

        var amount = toNum(getLineAmount(rec, "expense", row, lines));

        log.debug("expense amount", amount);

        var remaning_amount = toNum(getBudgetRemaining(row));

        log.debug("expense remaning_amount", remaning_amount);

        //check if the line is closed
        if (MODE == "edit") {
          var oldline = geOldSubLine("expense", row.custcol_line_unique_key);
          //if there is a old line and it is not closed and the current line is closed it refers we need release the amount in the budget
          if (oldline && !oldline.isclosed && row.isclosed) {
            var financial_year = getFinancialyear(rec.getValue("trandate"));
            var old_financial_year = getFinancialyear(
              OLD_DATE || rec.getValue("trandate")
            );

            log.debug("line is closed release the budget amount it on line", i);
            if (financial_year == old_financial_year) {
              RELEASE_LIST.push({ budget: row.budget.id, oldLine: oldline });
              continue;
            }
          }
        }

        if (amount > remaning_amount) {
          row.budval_pending = true;
          var warning = getWarning(row, line, "expense", amount);
          result.errors.push(warning);

          rec.selectLine({
            sublistId: "expense",
            line: i,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_budget_validation_pending",
            value: true,
          });

          rec.commitLine({
            sublistId: "expense",
          });

          continue;
        } else {
          //do the remaining calc
          var rem = remaning_amount + amount;

          if (rem >= 0) {

            addorUpdate({
              id: row.budget.id,
              rem: rem,
              utilised: amount * -1,
              org_utilised: 0//toNum(row.budget.custrecord_utilised_amount),
            });

          }

          var utilised_row = BACK_TRACK.filter(function (c) {
            if (c.id == row.budget.id) return c;
          });

          if (utilised_row.length > 0) utilised_row = utilised_row[0];

          rec.selectLine({
            sublistId: "expense",
            line: i,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_fund_center_pr",
            value: row.fundCenter.custrecord_fund_center_list_name,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_commitment_item_pr",
            value: row.commitmentItem.id,
          });
          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_budget_line_level",
            value: row.budget.id,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_amount_not_utilised",
            value: rem,
          });

          rec.setCurrentSublistValue({
            sublistId: "expense",
            fieldId: "custcol_utilized_amount_001",
            value: utilised_row.utilised,
          });

          rec.commitLine({
            sublistId: "expense",
          });
        }
      }
    } else {
      return budgetResponse;
    }
    return result;
  }

  // function getWarning(row, line, type, amount) {
  //   var title = "";
  //   if (type == "item")
  //     title =
  //       "Warn:Budget validation Pending for item " +
  //       row.item_txt +
  //       " on line:" +
  //       line;
  //   else
  //     title =
  //       "Warn:Budget validation Pending for expense " +
  //       row.account_txt +
  //       " on line:" +
  //       line;

  //   var msg = "Budget:" + row.budget.id + "</br>";
  //   msg +=
  //     "FundCenter:" +
  //     row.fundCenter.custrecord_fund_center_list_name_txt +
  //     "</br>";
  //   msg += "CommitmentItem:" + row.commitmentItem.name + "</br>";
  //   msg +=
  //     "The Budget amount is INR Rs." +
  //     convertTOINR(toNum(row.amount)) +
  //     " Transaction Amount is INR Rs." +
  //     convertTOINR(toNum(getBudgetRemaining(row)))
  //   msg +=
  //     ". Budget Amount is short by INR Rs." +
  //     convertTOINR(toNum(amount - getBudgetRemaining(row))) + "." + " ";

  //     msg += " Kindly release more budget before proceeding further."

  //   var warning = {
  //     title: title,
  //     message: msg,
  //   };
  //   return warning;
  // }

  function getWarning(row, line, type, amount) {

    var title = "";
    if (type == "item")
      title =
        "Warn:Budget validation Pending for item " +
        row.item_txt +
        " on line:" +
        line;
    else
      title =
        "Warn:Budget validation Pending for expense " +
        row.account_txt +
        " on line:" +
        line;

    var msg = "The Budget Amount is INR Rs." +
      convertTOINR(toNum(getBudgetRemaining(row))) + "." + "<br/>"

    msg += " Transaction Amount is INR Rs." +
      convertTOINR(toNum(amount)) + "<br/>"

    msg +=
      ". Budget is short by INR Rs." +
      convertTOINR(toNum(amount - getBudgetRemaining(row))) + "." + "<br/>";
    msg += " ";

    msg += "Kindly release more budget before proceeding further."

    var tech_details = "Budget = " + row.budget.id + "</br> ";
    tech_details +=
      "Fund Center =" +
      row.fundCenter.custrecord_fund_center_list_name_txt +
      "</br>";
    tech_details += "Commitment Item = " + row.commitmentItem.name

    var warning = {
      title: title,
      message: msg,
      tech_details: tech_details
    };
    return warning;
  }

  function convertTOINR(num) {
    input = num;
    var n1, n2;
    num = num + '' || '';
    // works for integer and floating as well
    n1 = num.split('.');
    n2 = n1[1] || null;
    n1 = n1[0].replace(/(\d)(?=(\d\d)+\d$)/g, "$1,");
    num = n2 ? n1 + '.' + n2 : n1;
    //console.log("Input:", input)
    // console.log("Output:", num)
    return num;
  }

  function getExpenseBudgets(rec, explines) {
    var errors = [];
    var budgets = [];
    log.debug("getExpenseBudgets", "<------exp lines----->");
    var cost_center = rec.getValue("cseg_cost_centre");
    var cc_list = pick(explines, "cseg_cost_centre");
    cc_list.push(cost_center);
    cc_list = removeNullOrDefault(cc_list);
    log.debug("cc list", cc_list);
    var trandate = rec.getValue("trandate");
    var financial_year = getFinancialyear(trandate);

    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message:
          "financial year was not found for the transaction date. Please configure the financial year list",
        tech_details: ""
      });
    }

    if (cc_list.length == 0) {
      errors.push({
        title: "cost center not defined on the expense line.",
        message:
          "please select the cost center on line or body level and try again",
        tech_details: ""
      });
    }

    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: budgets,
      };
    }

    var subsidiary = getValue(rec, "subsidiary");

    var fundRes = findFundCenter(subsidiary, cc_list);

    //[sub,cc] or [sub,item,cc]
    for (var i = 0; i < explines.length; i++) {
      var row = explines[i];
      var res = fundRes.filter(function (c) {
        var cc = row.cseg_cost_centre;
        if (!cc) {
          cc = cost_center;
        }

        var cc_center_budget = c.custrecord_cost_center_budget.split(",").map(function (x) {
          return parseInt(x);
        });

        if (cc_center_budget.indexOf(parseInt(cc)) != -1) return c;
      });
      if (res.length > 0) {
        row.fundCenter = res[0];
      } else {
        // errors.push({
        //   title: "fundcenter not found",
        //   message: " Fund centre tagging is missing. Please create following records before proceeding further. 1. Fund Centre ( if new fund centre name is required). 2. Fund Centre Tagging. 3. Fund Centre to Commitment Item tagging. 4. Initial Budget. 5. Release Budget." +
        //     (i) +
        //     " with account " +
        //     row.account_txt,
        //   // message:
        //   //   "fundcenter item not found for line " +
        //   //   (i) +
        //   //   " with account " +
        //   //   row.account_txt,
        // });





        var msg = ""

        msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
        msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
        msg += "2. Fund Centre Tagging." + "<br/>";
        msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
        msg += "4. Initial Budget" + "<br/>";
        msg += " 5. Release Budget" + "<br/>";


        var techVal = ""
        techVal += "Account = " + row.account_txt + "<br/>"
        techVal += "Line = " + i + "<br/>"
        techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
        if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
          techVal += "Location = " + row.location_txt
        } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
          techVal += "Department = " + row.department_txt
        } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
          techVal += "Cost Center = " + row.cseg_cost_centre_txt
        }

        errors.push({
          title: "FUND CENTER NOT FOUND",
          message: msg,
          tech_details: techVal
        });
      }
    }

    var accountList = unique(pick(explines, "account"));
    log.debug("accountList", accountList);
    var cmRes = findCommitmentItems(accountList);
    log.debug("cmRes", cmRes);

    for (var i = 0; i < explines.length; i++) {
      var row = explines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      } else {
        // errors.push({
        //   title: "commitment item not found",
        //   message: "Commitment item tagging is missing. Please create following records before proceeding further. 1. Commitment Item and its Tagging. 3. Fund Centre to Commitment Item tagging. 4. Initial Budget . 5. Release Budget" +
        //     (i) +
        //     row.account_txt,
        //   // message:
        //   //   "commitment item not found for the line " +
        //   //   (i) +
        //   //   row.account_txt,
        // });


        var msg = ""
        msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
        msg += " 1. Commitment Item and its Tagging." + "<br/>"
        msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
        msg += " 3. Initial Budget." + "<br/>"
        msg += " 4. Release Budget" + "<br/>"

        var techDetaii = ""
        techDetaii += "Account = " + row.account_txt + "<br/>"
        techDetaii += "Line = " + i + "<br/>"
        techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
        if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
          techDetaii += "Location = " + row.location_txt
        } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
          techDetaii += "Department = " + row.department_txt
        } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
          techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
        }


        errors.push({
          title: "COMMITMENT ITEM NOT FOUND",
          message: msg,
          tech_details: techDetaii
        });

      }
    }
    if (errors.length == 0) {
      log.debug("explines commit and res", explines);
      for (var i = 0; i < explines.length; i++) {
        var row = explines[i];
        // if (!row.fundCenter || !row.commitmentItem) {
        //   errors.push({
        //     title: "FUNDCENTER/COMMITMENT NOT FOUND",
        //     message: "Fund Centre & Commitment Item taggings are missing. Please create following records before proceeding further. 1. Fund Centre ( if new fund centre name is required). 2. Fund Centre Tagging. 3. Commitment Item and its Tagging. 4. Fund Centre to Commitment Item tagging. 5. Initial Budget. 6. Release Budget" + 
        //     row.account_txt +
        //     "on the line " +
        //     i,
        //     // message:
        //     //   "fund center or commitment item not found for item " +
        //     //   row.account_txt +
        //     //   "on the line " +
        //     //   i,
        //   });
        // }

        if (!row.fundCenter && !row.commitmentItem) {

          var msg = ""

          msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
          msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
          msg += "2. Fund Centre Tagging." + "<br/>";
          msg += "3.Commitment Item and its Tagging." + "<br/>"
          msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
          msg += "5. Initial Budget" + "<br/>";
          msg += " 6. Release Budget" + "<br/>";


          var techVal = ""
          techVal += "Account = " + row.account_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
            techVal += "Location = " + row.location_txt
          } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
            techVal += "Department = " + row.department_txt
          } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
            techVal += "Cost Center = " + row.cseg_cost_centre_txt
          }
          errors.push({
            title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
            message: msg,
            tech_details: techVal
          });

        } else {
          if (!row.fundCenter) {


            var msg = ""

            msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "4. Initial Budget" + "<br/>";
            msg += " 5. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Account = " + row.account_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }

            errors.push({
              title: "FUND CENTER NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          }

          if (!row.commitmentItem) {
            var msg = ""
            msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
            msg += " 1. Commitment Item and its Tagging." + "<br/>"
            msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
            msg += " 3. Initial Budget." + "<br/>"
            msg += " 4. Release Budget" + "<br/>"

            var techDetaii = ""
            techDetaii += "Account = " + row.account_txt + "<br/>"
            techDetaii += "Line = " + i + "<br/>"
            techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techDetaii += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              techDetaii += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
            }


            errors.push({
              title: "COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techDetaii
            });

          }
        }
      }
    }

    if (errors.length == 0) {
      var commitment_items = pick(pick(explines, "commitmentItem"), "id");
      var fundcenter = pick(
        pick(explines, "fundCenter"),
        "custrecord_fund_center_list_name"
      );
      budgets = findBudget(fundcenter, commitment_items, financial_year);
      for (var i = 0; i < explines.length; i++) {
        var row = explines[i];
        var line = i + 1;
        var res = budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name ==
            row.fundCenter.custrecord_fund_center_list_name &&
            c.custrecord_commitment_item_name == row.commitmentItem.id
          )
            return c;
        });
        if (res.length > 0) row.budget = res[0];
        else {
          var msg = ""

          msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
          msg += "1. Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
          msg += "1. Initial Budget." + "<br/>"
          msg += "2. Release Budget"

          var techVal = ""
          techVal += "Account = " + row.account_txt + "<br/>"
          techVal += "Line = " + i

          errors.push({
            title: "budget not found on the expense line",
            message: msg,
            tech_details: techVal
          });
        }
      }
    }

    if (errors.length > 0) {
      for (var i = 0; i < explines.length; i++) {
        var row = explines[i];
        if (!row.fundCenter || !row.commitmentItem) {
          rec.selectLine({
            sublistId: "expense",
            line: row.line,
          });

          if (!row.fundCenter)
            rec.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "custcol_fund_center_pr",
              value: "",
            });

          if (!row.commitmentItem)
            rec.setCurrentSublistValue({
              sublistId: "expense",
              fieldId: "custcol_commitment_item_pr",
              value: "",
            });

          rec.commitLine({
            sublistId: "expense",
          });
        }
      }
    }
    return {
      errors: errors,
      budgets: budgets,
    };
  }

  function findCommitmentItems(accountList) {
    var cm_req = {
      type: "customrecord_coa_commit_items_budget",
      filters: [
        ["isinactive", "is", "F"],
        "AND",
        ["custrecord_gl_account", "anyof", accountList],
      ],
      columns: ["name", "custrecord_gl_account"],
    };

    return getSearch(cm_req.type, cm_req.filters, cm_req.columns);
  }

  function addorUpdate(updaterow) {
    var res = BACK_TRACK.filter(function (c) {
      if (c.id == updaterow.id) return c;
    });

    if (res.length == 0) {
      BACK_TRACK.push({
        id: updaterow.id,
        rem: updaterow.rem,
        utilised: updaterow.org_utilised + updaterow.utilised,
      });
    } else {
      res[0].utilised += updaterow.utilised;
      res[0].rem = updaterow.rem;
    }
  }

  function getFinancialyear(trandate) {
    //var trandate = rec.getValue("trandate");
    var month = trandate.getMonth();
    var fullyear = parseInt(trandate.getFullYear());
    log.debug("Month:" + month, "Year:" + fullyear);
    //if it is less than april take previous year
    if (month < 3) {
      fullyear -= 1;
    }
    fullyear = fullyear.toString();
    switch (fullyear) {
      // case "2018":
      //   return 1;
      // case "2019":
      //   return 2;
      // case "2020":
      //   return 3;
      // case "2021":
      //   return 4;
      // case "2022":
      //   return 5;
      // case "2023":
      //   return 6;
      case "2024":
        return 1;
      case "2025":
        return 2;
      case "2026":
        return 3;
      case "2027":
        return 4;
      case "2028":
        return 5;
      case "2029":
        return 6;
      case "2030":
        return 7;
      case "2031":
        return 8;
    }
  }

  function getBudgetRemaining(row) {
    var budget = BACK_TRACK.filter(function (c) {
      if (c.id == row.budget.id) {
        return c;
      }
    });

    //check if the same budget is used else where
    if (budget.length == 0 && row.budget) {
      //var budget_amount = toNum( row.budget.custrecord_budget_amount);
      var remaining = toNum(row.budget.custrecord_yet_to_be_utilised);
      log.debug("remaining", remaining);
      return remaining;
    } else if (budget.length > 0) {
      return budget[0].rem;
    } else {
      return 0;
    }
  }

  function getLineAmount(rec, sublist, row, lines) {

    if (rec.type == "vendorcredit") {
      return getVendorCreditAmount(rec, sublist, row);

    }

  }

  function getVendorCreditAmount(rec, sublist, row) {
    var amount = 0;

    log.debug("getVendorCreditAmount:" + sublist, row);

    if (MODE == "create" || MODE == "copy") {
      if (row.custcol_gst_nature == "Non Deductible") {
        log.debug("non deductable gst:" + sublist, row.taxamount);
        return toNum(row.amount) + toNum(row.taxamount);
      } else {
        return row.amount;
      }

    } else {
      if (sublist == "item") {

        var res = ITEM_LIST.filter(function (c) {
          if (c.item == row.item && isBudgetParamSame(rec, row, c))
            return c;
        });


        log.debug("oldVendorCreditLine:" + sublist, res);

        if (row.custcol_gst_nature == "Non Deductible") {

          log.debug("edit non deductable gst:" + sublist, row.taxamount);

          if (res.length == 0)
            amount = row.amount + row.taxamount;
          else
            amount = row.amount + row.taxamount - res[0].amount - res[0].taxamount;

        } else {

          if (res.length == 0)
            amount = row.amount;
          else
            amount = row.amount - res[0].amount;

        }
      } else {

        var res = EXPENSE_LIST.filter(function (c) {
          if (c.account == row.account && isBudgetParamSame(rec, row, c))
            return c;
        });
        if (res.length == 0)
          amount = row.amount;
        else
          amount = row.amount - res[0].amount;

      }
    }

    return amount;

  }

  function isBudgetParamSame(rec, row, compareRow) {
    var currentDate = rec.getValue("trandate");
    var financial_year = getFinancialyear(currentDate);
    var old_financial_year = getFinancialyear(OLD_DATE || currentDate);

    if (compareRow.custcol_line_unique_key == row.custcol_line_unique_key &&
      compareRow.custcol_commitment_item_pr == row.commitmentItem.id &&
      compareRow.custcol_fund_center_pr == row.fundCenter.custrecord_fund_center_list_name &&
      financial_year == old_financial_year &&
      !compareRow.isclosed)
      return true;
    else
      return false;
  }

  function getItemBudgets(rec, lines) {
    lines = lines.filter(function (c) {
      if (c.type != "Discount") return c;
    });

    lines = lines.filter(function (c) {
      if (c.ignoreBudget == false) return true;
    });
    log.debug("get Item Budgets", lines);
    var group_item = groupBy(lines, "custcol_budget_item_type");
    log.debug("group_item", group_item);
    var response = [];
    var errors = [];
    for (var key in group_item) {
      var items_list = group_item[key];
      switch (key) {
        case "1":
          var res = findBudgetUsingItem(rec, items_list);
          log.debug("get using item res", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;
        case "2":
          var res = findBudgetUsingItemCategory(rec, items_list);
          log.debug("get using department and location", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;
        case "3":
          var res = findBudgetUsingCostCenter(rec, items_list);
          log.debug("get using Cost Center", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;
        case "4":
          var res = findBudgetUsingCostCenter(rec, items_list);
          log.debug("get using Cost Center", res);
          if (res.errors.length > 0) errors = errors.concat(res.errors);
          else response = response.concat(res.budgets);
          break;
        default:
          errors.push({
            title: "Invalid budget item type.",
            message: "please select supported item budget type",
            tech_details: ""
          });
          break;
      }
    }

    if (errors.length > 0) {
      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];

        if (!row.fundCenter || !row.commitmentItem) {
          rec.selectLine({
            sublistId: "item",
            line: row.line,
          });

          if (!row.fundCenter)
            rec.setCurrentSublistValue({
              sublistId: "item",
              fieldId: "custcol_fund_center_pr",
              value: "",
            });

          if (!row.commitmentItem)
            rec.setCurrentSublistValue({
              sublistId: "item",
              fieldId: "custcol_commitment_item_pr",
              value: "",
            });

          rec.commitLine({
            sublistId: "item",
          });
        }
      }
    }

    return {
      response: response,
      errors: errors,
    };
  }

  function findBudgetUsingItem(rec, lines) {
    var errors = [];
    var budgets = [];
    var subsidiary = getValue(rec, "subsidiary");
    var items = pick(lines, "item");
    var location = pick(lines, "location");
    var loc_res = location.filter(function (c) {
      if (c != "" && c != null && c != undefined) return c;
    });

    var loc = rec.getValue("location") || "";
    if (loc_res.length == 0 && !isNullorDefault(loc)) {
      loc_res = [loc];
    }
    if (loc_res.length == 0) {
      errors.push({
        title: "Location not defined on both line and body level",
        message: "please select the location",
        tech_details: ""
      });
    }

    var parents = loc_res.map(function (c) {
      //include parent location as well
      var parent_res = LOCATION_LIST.filter(function (curloc) {
        if (c == curloc.id) return c;
      });

      if (
        parent_res.length > 0 &&
        parent_res[0].custrecord_parent_budget == true
      )
        return pick(parent_res[0].parent, "id");
    });

    var flat_parents = removeNullOrDefault([].concat.apply([], parents));

    loc_res = loc_res.concat(flat_parents);

    log.debug("location with its parents", loc_res);

    var trandate = rec.getValue("trandate");
    var financial_year = getFinancialyear(trandate);

    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "please select trandate or financial year not configured",
        tech_details: ""
      });
    }
    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: [],
      };
    }
    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],
        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        ["custrecord_item_budget", "anyof", items],
        "AND",
        ["custrecord_location_budget", "anyof", loc_res],
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
      ],
    };
    var fundRes = getSearch(req.type, req.filters, req.columns);

    if (fundRes.length == 0) {

    }

    for (var i = 0; i < lines.length; i++) {
      var line_ui = i + 1;
      var row = lines[i];
      if (isNullorDefault(row.location)) row.location = loc;

      var parent_loc = LOCATION_LIST.filter(function (c) {
        if (c.id == row.location && c.custrecord_parent_budget == true)
          return c;
      });

      if (parent_loc.length > 0) {
        row.parent_location = pick(parent_loc[0].parent, "id");
      } else {
        row.parent_location = [];
      }

      var res = fundRes.filter(function (c) {
        if (
          c.custrecord_item_budget == row.item &&
          row.location == c.custrecord_location_budget
        )
          return c;
      });

      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          if (
            c.custrecord_item_budget == row.item &&
            isFound(c.custrecord_location_budget, row.parent_location)
          )
            return c;
        });
      }

      if (res.length > 0) {
        row.fundCenter = res[0];
      } else {

      }
    }
    //directly taking the account field for all lines because expense vs asset is handled on basis of item type already
    var accountList = pick(lines, "account");
    var cmRes = findCommitmentItems(accountList);
    if (cmRes.length == 0) {

    }
    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      }
    }
    log.debug("new updated lines", lines);
    //check for commitment and fund center for all lines exist or not
    var excludeList = ["12345"];
    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      if (row.type != "Discount" && excludeList.indexOf(row.item) == -1) {
        if (!row.fundCenter && !row.commitmentItem) {

          var msg = ""

          msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
          msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
          msg += "2. Fund Centre Tagging." + "<br/>";
          msg += "3.Commitment Item and its Tagging." + "<br/>"
          msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
          msg += "5. Initial Budget" + "<br/>";
          msg += " 6. Release Budget" + "<br/>";


          var techVal = ""
          techVal += "Item = " + row.item_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
            techVal += "Location = " + row.location_txt
          } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
            techVal += "Department = " + row.department_txt
          } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
            techVal += "Cost Center = " + row.cseg_cost_centre_txt
          }
          errors.push({
            title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
            message: msg,
            tech_details: techVal
          });

        } else {
          if (!row.fundCenter) {


            var msg = ""

            msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "4. Initial Budget" + "<br/>";
            msg += " 5. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Item = " + row.item_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }

            errors.push({
              title: "FUND CENTER NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          }

          if (!row.commitmentItem) {
            var msg = ""
            msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
            msg += " 1. Commitment Item and its Tagging." + "<br/>"
            msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
            msg += " 3. Initial Budget." + "<br/>"
            msg += " 4. Release Budget" + "<br/>"

            var techDetaii = ""
            techDetaii += "Item = " + row.item_txt + "<br/>"
            techDetaii += "Line = " + i + "<br/>"
            techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techDetaii += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              techDetaii += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
            }


            errors.push({
              title: "COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techDetaii
            });

          }
        }
      }
    }

    if (errors.length == 0) {
      var commitment_items = pick(pick(lines, "commitmentItem"), "id");
      var fundcenter = pick(
        pick(lines, "fundCenter"),
        "custrecord_fund_center_list_name"
      );
      budgets = findBudget(fundcenter, commitment_items, financial_year);
      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];
        var res = budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name ==
            row.fundCenter.custrecord_fund_center_list_name &&
            c.custrecord_commitment_item_name == row.commitmentItem.id
          )
            return c;
        });

        if (res.length > 0) row.budget = res[0];
        else {
          var ff_msg = row.fundCenter.custrecord_fund_center_list_name_txt
          var cc_msg = row.commitmentItem.name

          var msg = ""
          msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
          msg += "1.Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
          msg += " 2. Initial Budget." + "<br/>"
          msg += " 3. Release Budget" + "<br/>"


          var techDetails = ""
          techDetails += "\n Item = " + row.item_txt + "<br/>"
          techDetails += "\nFund Center = " + ff_msg + "</br> "
          techDetails += "\nCommitment Item = " + cc_msg


          errors.push({
            title: "Budget not Found",
            message: msg,
            tech_details: techDetails
          });
        }
      }
    }
    return {
      errors: errors,
      budgets: budgets,
    };
  }

  function findBudgetUsingItemCategory(rec, lines) {
    var errors = [];
    var budgets = [];
    var subsidiary = getValue(rec, "subsidiary");
    var departments = removeNullOrDefault(pick(lines, "department"));
    var body_department = getValue(rec, "department");
    var items = pick(lines, "item");

    if (departments.length == 0) {
      if (isNullorDefault(body_department)) {
        errors.push({
          title: "Department not selected",
          message: "department not selected on both line or body level",
          tech_details: ""
        });
      } else {
        departments = [body_department];
      }
    }

    var trandate = rec.getValue("trandate");

    var financial_year = getFinancialyear(trandate);

    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "please select trandate or financial year not configured",
        tech_details: ""
      });
    }

    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: [],
      };
    }

    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],
        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        [
          ["custrecord_deparment_tagging", "anyof", departments],
          "OR",
          ["custrecord_item_budget", "anyof", items],
        ],
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
      ],
    };

    var fundRes = getSearch(req.type, req.filters, req.columns);
    var ids = pick(fundRes, "id");

    log.debug("fund->ids", ids);

    if (fundRes.length == 0) {

    }
    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = fundRes.filter(function (c) {
        if (isNullorDefault(row.department)) row.department = body_department;
        if (
          c.custrecord_deparment_tagging == row.department &&
          row.item == c.custrecord_item_budget
        )
          return c;
      });

      //look for dept with item tagging
      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          if (isNullorDefault(row.department)) row.department = body_department;
          if (
            c.custrecord_deparment_tagging == row.department &&
            isNullorDefault(c.custrecord_item_budget)
          )
            return c;
        });
      }

      if (res.length > 0) {
        row.fundCenter = res[0];
      } else {

      }
    }
    var accountList = pick(lines, "account");
    var cmRes = findCommitmentItems(accountList);
    log.debug("cmRes", cmRes);
    if (cmRes.length == 0) {

    }

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      }
    }
    log.debug("commit and res", lines);
    //check for commitment and fund center for all lines exist or not
    var excludeList = ["12345"];
    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      if (row.type != "Discount" && excludeList.indexOf(row.item) == -1) {



        if (!row.fundCenter && !row.commitmentItem) {

          var msg = ""

          msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
          msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
          msg += "2. Fund Centre Tagging." + "<br/>";
          msg += "3.Commitment Item and its Tagging." + "<br/>"
          msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
          msg += "5. Initial Budget" + "<br/>";
          msg += " 6. Release Budget" + "<br/>";


          var techVal = ""
          techVal += "Account = " + row.account_txt + "<br/>"
          techVal += "Line = " + i + "<br/>"
          if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
            techVal += "Location = " + row.location_txt
          } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
            techVal += "Department = " + row.department_txt
          } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
            techVal += "Cost Center = " + row.cseg_cost_centre_txt
          }
          errors.push({
            title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
            message: msg,
            tech_details: techVal
          });

        } else {
          if (!row.fundCenter) {


            var msg = ""

            msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "4. Initial Budget" + "<br/>";
            msg += " 5. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Account = " + row.account_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }

            errors.push({
              title: "FUND CENTER NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          }

          if (!row.commitmentItem) {
            var msg = ""
            msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
            msg += " 1. Commitment Item and its Tagging." + "<br/>"
            msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
            msg += " 3. Initial Budget." + "<br/>"
            msg += " 4. Release Budget" + "<br/>"

            var techDetaii = ""
            techDetaii += "Account = " + row.account_txt + "<br/>"
            techDetaii += "Line = " + i + "<br/>"
            techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techDetaii += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              techDetaii += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
            }


            errors.push({
              title: "COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techDetaii
            });

          }
        }






      }
    }

    if (errors.length == 0) {
      var commitment_items = pick(pick(lines, "commitmentItem"), "id");
      var fundcenter = pick(
        pick(lines, "fundCenter"),
        "custrecord_fund_center_list_name"
      );
      budgets = findBudget(fundcenter, commitment_items, financial_year);
      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];
        var res = budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name ==
            row.fundCenter.custrecord_fund_center_list_name &&
            c.custrecord_commitment_item_name == row.commitmentItem.id
          )
            return c;
        });

        if (res.length > 0) row.budget = res[0];
        else {
          var ff_msg = row.fundCenter.custrecord_fund_center_list_name_txt
          var cc_msg = row.commitmentItem.name

          var msg = ""
          msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
          msg += "1.Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
          msg += " 2. Initial Budget." + "<br/>"
          msg += " 3. Release Budget" + "<br/>"


          var techDetails = ""
          techDetails += "\n Item = " + row.item_txt + "<br/>"
          techDetails += "\nFund Center = " + ff_msg + "</br> "
          techDetails += "\nCommitment Item = " + cc_msg


          errors.push({
            title: "Budget not Found",
            message: msg,
            tech_details: techDetails
          });
        }
      }
    }
    return {
      errors: errors,
      budgets: budgets,
      lines: lines,
    };
  }

  function findBudgetUsingCostCenter(rec, lines) {
    var errors = [];
    var budgets = [];
    var subsidiary = getValue(rec, "subsidiary");
    var costcenter = getValue(rec, "cseg_cost_centre");
    var items = pick(lines, "cseg_cost_centre") || [];
    log.debug("linelevel cost center", items);
    var cc_list = items.filter(function (c) {
      if (c != "" && c != null && c != undefined) return c;
    });

    if (cc_list.length == 0 && !isNullorDefault(costcenter)) {
      cc_list = [costcenter];
    }

    if (cc_list.length == 0) {
      errors.push({
        title: "cost center not defined",
        message: "please select cost center for the line item",
        tech_details: ""
      });
    }
    var trandate = rec.getValue("trandate");
    var financial_year = getFinancialyear(trandate);
    if (!financial_year) {
      errors.push({
        title: "Financial year not found",
        message: "please select trandate or financial year not configured",
        tech_details: ""
      });
    }

    if (errors.length > 0) {
      return {
        errors: errors,
        budgets: [],
      };
    }

    var fundRes = findFundCenter(subsidiary, cc_list);

    log.debug("fundRes", fundRes);

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = fundRes.filter(function (c) {
        var cc = row.cseg_cost_centre;
        if (!cc) {
          row.cseg_cost_centre = costcenter;
          cc = costcenter;
        }

        var cc_center_budget = c.custrecord_cost_center_budget.split(",").map(function (x) {
          return parseInt(x);
        });

        log.debug("cc_center_budget", cc_center_budget)

        log.debug("cc_center_budget =>cc", cc)

        if (
          c.custrecord_item_budget == row.item &&
          cc_center_budget.indexOf(parseInt(cc)) != -1
        ) {
          return c;
        }
      });

      log.debug("fundRes->res", res);

      if (res.length == 0) {
        res = fundRes.filter(function (c) {
          var cc = row.cseg_cost_centre;
          if (!cc) {
            row.cseg_cost_centre = costcenter;
            cc = costcenter;
          }

          var cc_center_budget = c.custrecord_cost_center_budget.split(",").map(function (x) {
            return parseInt(x);
          });

          if (
            cc_center_budget.indexOf(parseInt(cc)) != -1 &&
            isNullorDefault(c.custrecord_item_budget)
          ) {
            return c;
          }
        });
      }

      if (res.length > 0) {
        row.fundCenter = res[0];
      } else {
        var msg = ""

        msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
        msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
        msg += "2. Fund Centre Tagging." + "<br/>";
        msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
        msg += "4. Initial Budget" + "<br/>";
        msg += " 5. Release Budget" + "<br/>";


        var techVal = ""
        techVal += "Item = " + row.item_txt + "<br/>"
        techVal += "Line = " + i + "<br/>"
        techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
        if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
          techVal += "Location = " + row.location_txt
        } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
          techVal += "Department = " + row.department_txt
        } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
          techVal += "Cost Center = " + row.cseg_cost_centre_txt
        }

        errors.push({
          title: "FUND CENTER NOT FOUND",
          message: msg,
          tech_details: techVal
        });
      }
    }

    var accountList = pick(lines, "account");
    log.debug("accountList", accountList);
    var cmRes = findCommitmentItems(accountList);
    log.debug("cmRes", cmRes);

    for (var i = 0; i < lines.length; i++) {
      var row = lines[i];
      var res = cmRes.filter(function (c) {
        if (c.custrecord_gl_account.indexOf(row.account) != -1) return c;
      });
      if (res.length > 0) {
        row.commitmentItem = res[0];
      } else {
        errors.push({
          title: "commitment item not found",
          message: "Commitment item tagging is missing. Please create following records before proceeding further. 1. Commitment Item and its Tagging. 3. Fund Centre to Commitment Item tagging. 4. Initial Budget . 5. Release Budget" + row.item_txt + " was not found",
          // message:
          //   "commitment item not found for " + row.item_txt + " was not found",
        });
      }
    }

    if (errors.length == 0) {
      log.debug("commit and res", items);
      //check for commitment and fund center for all lines exist or not
      var excludeList = ["12345"];
      for (var i = 0; i < lines.length; i++) {
        var row = lines[i];
        if (row.type != "Discount" && excludeList.indexOf(row) == -1) {




          if (!row.fundCenter && !row.commitmentItem) {

            var msg = ""

            msg += "Fund Centre and Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>";
            msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
            msg += "2. Fund Centre Tagging." + "<br/>";
            msg += "3.Commitment Item and its Tagging." + "<br/>"
            msg += "4. Fund Centre to Commitment Item tagging. " + "<br/>";
            msg += "5. Initial Budget" + "<br/>";
            msg += " 6. Release Budget" + "<br/>";


            var techVal = ""
            techVal += "Account = " + row.account_txt + "<br/>"
            techVal += "Line = " + i + "<br/>"
            if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
              techVal += "Location = " + row.location_txt
            } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
              techVal += "Department = " + row.department_txt
            } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
              techVal += "Cost Center = " + row.cseg_cost_centre_txt
            }
            errors.push({
              title: "FUND CENTER AND COMMITMENT ITEM NOT FOUND",
              message: msg,
              tech_details: techVal
            });

          } else {
            if (!row.fundCenter) {


              var msg = ""

              msg += "Fund Centre is missing. Please create following records before proceeding further." + "<br/>";
              msg += "1. Fund Centre ( if new fund centre name is required)." + "<br/>";
              msg += "2. Fund Centre Tagging." + "<br/>";
              msg += "3. Fund Centre to Commitment Item tagging. " + "<br/>";
              msg += "4. Initial Budget" + "<br/>";
              msg += " 5. Release Budget" + "<br/>";


              var techVal = ""
              techVal += "Account = " + row.account_txt + "<br/>"
              techVal += "Line = " + i + "<br/>"
              techVal += "Commitment Item = " + row.commitmentItem.name + "<br/>"
              if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
                techVal += "Location = " + row.location_txt
              } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
                techVal += "Department = " + row.department_txt
              } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
                techVal += "Cost Center = " + row.cseg_cost_centre_txt
              }

              errors.push({
                title: "FUND CENTER NOT FOUND",
                message: msg,
                tech_details: techVal
              });

            }

            if (!row.commitmentItem) {
              var msg = ""
              msg += "Commitment Item tagging is missing. Please create following records before proceeding further." + "<br/>"
              msg += " 1. Commitment Item and its Tagging." + "<br/>"
              msg += " 2. Fund Centre to Commitment Item tagging." + "<br/>"
              msg += " 3. Initial Budget." + "<br/>"
              msg += " 4. Release Budget" + "<br/>"

              var techDetaii = ""
              techDetaii += "Account = " + row.account_txt + "<br/>"
              techDetaii += "Line = " + i + "<br/>"
              techDetaii += "Fund Center = " + row.fundCenter.custrecord_fund_center_list_name_txt + "<br/>"
              if (row.custcol_budget_item_type_txt == "Inventory (RM, PM)") {
                techDetaii += "Location = " + row.location_txt
              } else if (row.custcol_budget_item_type_txt == "Inventory (Others)") {
                techDetaii += "Department = " + row.department_txt
              } else if (row.custcol_budget_item_type_txt == "Cost Center" || row.custcol_budget_item_type_txt == "Asset") {
                techDetaii += "Cost Center = " + row.cseg_cost_centre_txt
              }


              errors.push({
                title: "COMMITMENT ITEM NOT FOUND",
                message: msg,
                tech_details: techDetaii
              });

            }
          }
        }
      }

      if (errors.length == 0) {
        var commitment_items = pick(pick(lines, "commitmentItem"), "id");
        var fundcenter = pick(
          pick(lines, "fundCenter"),
          "custrecord_fund_center_list_name"
        );

        budgets = findBudget(fundcenter, commitment_items, financial_year);
        for (var i = 0; i < lines.length; i++) {
          var row = lines[i];
          var res = budgets.filter(function (c) {
            if (
              c.custrecord_fund_center_name ==
              row.fundCenter.custrecord_fund_center_list_name &&
              c.custrecord_commitment_item_name == row.commitmentItem.id
            )
              return c;
          });

          if (res.length > 0) row.budget = res[0];
          else {
            var ff_msg = row.fundCenter.custrecord_fund_center_list_name_txt
            var cc_msg = row.commitmentItem.name

            var msg = ""
            msg += "Budget not found. Please create following records before proceeding further." + "<br/>"
            msg += "1.Fund Centre to Commitment Item Tagging (if not created before)" + "<br/>"
            msg += " 2. Initial Budget." + "<br/>"
            msg += " 3. Release Budget" + "<br/>"


            var techDetails = ""
            techDetails += "\n Item = " + row.item_txt + "<br/>"
            techDetails += "\nFund Center = " + ff_msg + "</br> "
            techDetails += "\nCommitment Item = " + cc_msg


            errors.push({
              title: "Budget not Found",
              message: msg,
              tech_details: techDetails
            });
          }
        }
      }
    }

    return {
      errors: errors,
      budgets: budgets,
    };

  }

  function printErrors(errorList) {
    for (var i = 0; i < errorList.length; i++) {
      var row = errorList[i];

      showError(row.title, row.message);
    }
  }

  function printWarnings(warningList) {
    for (var i = 0; i < warningList.length; i++) {
      var row = warningList[i];
      showWarning(row.title, row.message);
    }
  }

  function showWarning(title, details) {
    log.debug(title, details);
  }

  /**
   * Description:Updates the line item of the transaction with relavant data for the line.
   * @param {Array} items
   * @param {Record} curRec
   * @returns {void}
   */

  function updatelineItems(items, curRec) {
    var item_ids = pick(items, "item");
    if (item_ids.length > 0) {
      var details = getItemDetails(item_ids);
      for (var i = 0; i < items.length; i++) {
        var row = items[i];

        if (isNullorDefault(row.department)) {
          row.department = curRec.getValue("department");
        }

        if (isNullorDefault(row.location)) {
          row.location = curRec.getValue("location");
          row.location_txt = curRec.getText("location");
        }

        if (isNullorDefault(row.cseg_cost_centre)) {
          row.cseg_cost_centre = curRec.getValue("cseg_cost_centre");
        }

        var res = details.filter(function (c) {
          if (c.id == row.item) return c;
        });

        if (res.length > 0) {
          Object.assign(row, res[0]);
          if (row.type == "InvtPart" || row.type == "Assembly") {
            row.account = row.assetaccount;
            row.account_txt = row.assetaccount_txt;
          } else {
            row.account = row.expenseaccount;
            row.account_txt = row.expenseaccount_txt;
          }

          if (row.custitemother_charges_service > 0 && row.type == "Service") {
            row.ignoreBudget = true;
          } else {
            row.ignoreBudget = false;
          }
        }
      }
    }
  }

  function updateExpenseLines(expenseItems, curRec) {
    for (var i = 0; i < expenseItems.length; i++) {
      var row = expenseItems[i];
      if (isNullorDefault(row.cseg_cost_centre)) {
        row.cseg_cost_centre = curRec.getValue("cseg_cost_centre");
      }
    }
  }

  function updateResponseToRecord(response, expResponse, curRec) {
    var messages = [];
    messages = messages.concat(expResponse.errors, expResponse.warning);
    messages = messages.concat(response.errors, response.warning);
    messages = removeNullOrDefault(messages);
    var error_msg = ''
    if (messages.length > 0) {
      messages = messages.map(function (c) {
        return {
          ErrorCode: c.title,
          Message: c.message,
          Technical_Details: c.tech_details

        }
      })
      error_msg = tableGen.toTable(messages);
    }
    else
      error_msg = ''


    if (error_msg.length > 0) {
      curRec.setValue("custbody_budget_error", error_msg);


      var count = curRec.getLineCount("item");

      for (var i = 0; i < count; i++) {

        curRec.selectLine({
          sublistId: "item",
          line: i
        });

        curRec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_amount_not_utilised",
          value: null,
        });

        curRec.setCurrentSublistValue({
          sublistId: "item",
          fieldId: "custcol_utilized_amount_001",
          value: null
        });

        curRec.commitLine({
          sublistId: "item"
        })

      }

      var count = curRec.getLineCount("expense");

      for (var i = 0; i < count; i++) {

        curRec.selectLine({
          sublistId: "expense",
          line: i
        });

        curRec.setCurrentSublistValue({
          sublistId: "expense",
          fieldId: "custcol_amount_not_utilised",
          value: null
        });

        curRec.setCurrentSublistValue({
          sublistId: "expense",
          fieldId: "custcol_utilized_amount_001",
          value: null
        });

        curRec.commitLine({
          sublistId: "expense"
        })

      }

    } else {
      curRec.setValue("custbody_budget_error", "");
    }
  }

  function getItemDetails(item_ids) {
    var itemSer = {
      type: "item",
      filters: [["internalid", "anyof", item_ids]],
      columns: [
        "expenseaccount",
        "custitem_sub_group_1",
        "assetaccount",
        "type",
        "custitemother_charges_service",
      ],
    };

    return getSearch(itemSer.type, itemSer.filters, itemSer.columns);
  }

  function getLineItems(curRec) {
    var col = [];
    if (curRec.type == "vendorcredit") {
      col = [
        "item",
        "rate",
        "amount",
        "quantity",
        "department",
        "location",
        "custcol_budget_item_type",
        "cseg_cost_centre",
        "isclosed",
        "custcol_line_unique_key",
        "custcol_in_hsn_code",
        "custcol_in_nature_of_item",
        "linkedorder",
        "quantityreceived",
        "custcol_prev_consumed_amt",
        "custcol_po_reference",
        "taxamount",
        "custcol_gst_nature"
      ];
    }

    var list = getLines(curRec, "item", col);

    return list;
  }

  function getExpenseList(curRec) {
    var col = [
      "account",
      "rate",
      "amount",
      "department",
      "location",
      "cseg_cost_centre",
      "isclosed",
      "custcol_line_unique_key",
      "taxamount",
      "custcol_gst_nature"
    ];

    var list = getLines(curRec, "expense", col);
    return list;
  }

  function setEnv(ctx) {
    SEARCH = search;
    RECORD = record;
    RUNTIME = runtime;
    MOMENT = moment;
    BACK_TRACK = [];
  }

  function getOldRec(tranrec) {
    try {
      var oldRecJSON = tranrec.getValue("custbody_old_record_date");

      log.debug("oldRecJSON", oldRecJSON);

      return JSON.parse(oldRecJSON);
    } catch (e) {
      log.error("get old rec", e);

      return {
        MODE: 'create',
        ITEM_LIST: [],
        EXPENSE_LIST: [],
        CURRENCY: tranrec.getValue("currency"),
        CNVRT_FROM_PO: false,
        EXCHANGE_RATE: toNumRaw(tranrec.getValue("exchangerate")),
        PO_DATA: [],
        OLD_DATE: new Date(),
        OLD_CURRENCY: tranrec.getValue("currency")
      };
    }
  }

  function updateGlobals(tranrec) {
    var oldRec = getOldRec(tranrec);
    log.debug("oldRec", oldRec);
    MODE = oldRec.MODE;
    ITEM_LIST = oldRec.ITEM_LIST;
    EXPENSE_LIST = oldRec.EXPENSE_LIST;
    OLD_DATE = new Date(oldRec.OLD_DATE);
    ITEM_LINES_REM_FLG = oldRec.ITEM_LINES_REM_FLG;
    EXP_LINES_REM_FLG = oldRec.EXP_LINES_REM_FLG;
    CURRENCY = oldRec.CURRENCY;
    OLD_CURRENCY = oldRec.CURRENCY;
    OLD_EXCHANGE_RATE = oldRec.OLD_EXCHANGE_RATE;
    PO_DATA = oldRec.PO_DATA;
    CNVRT_FROM_PO = oldRec.CNVRT_FROM_PO;
    EXCHANGE_RATE = toNumRaw(tranrec.getValue("exchangerate"));
    CURRENCY = tranrec.getValue("currency");

    var locationSer = {
      type: "location",
      filters: [["isinactive", "is", false]],
      columns: ["name", "custrecord_parent_budget"],
    };

    LOCATION_LIST = getSearch(
      locationSer.type,
      locationSer.filters,
      locationSer.columns
    );

    log.debug("location loaded", LOCATION_LIST);

    for (var i = 0; i < LOCATION_LIST.length; i++) {
      LOCATION_LIST[i].parent = getParentId(LOCATION_LIST[i], LOCATION_LIST);
    }

    var fundCenterSer = {
      type: "customrecord_fund_center_list",
      columns: ["name"],
      filters: [],
    };

    FUND_CENTER_LIST = getSearch(
      fundCenterSer.type,
      fundCenterSer.filter,
      fundCenterSer.columns
    );

  }

  function updateOldBudgets() {
    if (MODE == "edit") {
      var old_financial_year = getFinancialyear(OLD_DATE);
      //release the old budgets
      var item_fund_centers = pick(ITEM_LIST, "custcol_fund_center_pr");
      var item_commitment_items = pick(ITEM_LIST, "custcol_commitment_item_pr");

      var exp_fund_centers = pick(EXPENSE_LIST, "custcol_fund_center_pr");
      var exp_commitment_items = pick(
        EXPENSE_LIST,
        "custcol_commitment_item_pr"
      );

      //add all to together
      var fund_centers = removeNullOrDefault(
        item_fund_centers.concat(exp_fund_centers)
      );
      var commit_items = removeNullOrDefault(
        item_commitment_items.concat(exp_commitment_items)
      );
      //log.debug(fund_centers);
      //log.debug(commit_items);

      log.debug("old fundcenters:", fund_centers);
      log.debug("old commit_items:", commit_items);

      var old_budgets = findBudget(
        fund_centers,
        commit_items,
        old_financial_year
      );

      for (var i = 0; i < EXPENSE_LIST.length; i++) {
        var exp = EXPENSE_LIST[i];
        var budgetRes = old_budgets.filter(function (c) {
          if (
            c.custrecord_fund_center_name == exp.custcol_fund_center_pr &&
            c.custrecord_commitment_item_name == exp.custcol_commitment_item_pr
          )
            return c;
        });
        if (budgetRes.length > 0) {
          exp.budget = budgetRes[0];
        }
      }

      for (var i = 0; i < ITEM_LIST.length; i++) {
        var row = ITEM_LIST[i];
        var budgetRes = old_budgets.filter(function (c) {
          var fund_id = row.custcol_fund_center_pr;
          if (
            c.custrecord_fund_center_name == fund_id &&
            c.custrecord_commitment_item_name == row.custcol_commitment_item_pr
          )
            return c;
        });
        if (budgetRes.length > 0) {
          row.budget = budgetRes[0];
        }
      }
    }
  }

  function handleFinancialYearChange(rec, lineitems, expenselines) {
    var currentDate = rec.getValue("trandate");
    var old_financial_year = getFinancialyear(OLD_DATE);
    var new_financial_year = getFinancialyear(currentDate);

    log.debug("old financial year", old_financial_year);
    log.debug("new financial year", new_financial_year);

    if (old_financial_year != new_financial_year) {
      switch (rec.type) {
        case "vendorcredit":
          handleVCYearChange();
          break;

      }
    }
  }

  function handleVCYearChange() {
    var item_release_list = ITEM_LIST.filter(function (c) {
      if (c.budget) return c;
    }).map(function (c) {
      var amount = c.estimatedamount;

      return {
        budget: c.budget.id,
        oldLine: {
          amount: amount,
        },
      };
    });
    RELEASE_LIST = RELEASE_LIST.concat(item_release_list);
    var exp_release_list = EXPENSE_LIST.filter(function (c) {
      if (c.budget) return c;
    }).map(function (c) {
      var amount = c.estimatedamount;
      return {
        budget: c.budget.id,
        oldLine: {
          amount: amount,
        },
      };
    });
    RELEASE_LIST = RELEASE_LIST.concat(exp_release_list);
  }

  function findBudget(fundcenters, commit_items, financial_year) {
    if (!Array.isArray(fundcenters))
      fundcenters = removeNullOrDefault([fundcenters]);

    if (!Array.isArray(commit_items))
      commit_items = removeNullOrDefault([commit_items]);

    if (fundcenters.length > 0 && commit_items.length > 0) {
      var budgetReq = {
        type: "customrecord_budget",
        filters: [
          ["isinactive", "is", false],
          "AND",
          ["custrecord_commitment_item_name", "anyof", commit_items],
          "AND",
          ["custrecord_fund_center_name", "anyof", fundcenters],
          "AND",
          ["custrecord_financial_year", "anyof", financial_year],
        ],
        columns: [
          "custrecord_budget_type",
          "custrecord_fund_center_name",
          "custrecord_budget_amount",
          "custrecord_released_amount",
          "custrecord_yet_to_released",
          "custrecord_utilised_amount",
          "custrecord_yet_to_be_utilised",
          "custrecord_date_created_on",
          "custrecord_release_return",
          "custrecord_budget_return",
          "custrecord_commitment_item_name",
        ],
      };
      return getSearch(budgetReq.type, budgetReq.filters, budgetReq.columns);
    } else {
      return [];
    }
  }

  function findFundCenter(subsidiary, cc_list) {

    var req = {
      type: "customrecord_fund_center_budget",
      filters: [
        ["isinactive", "is", false],

        "AND",
        ["custrecord_subsidiary_budget", "anyof", subsidiary],
        "AND",
        ["custrecord_cost_center_budget", "anyof", cc_list],
      ],
      columns: [
        "custrecord_subsidiary_budget",
        "custrecord_item_budget",
        "custrecord_fund_center_list_name",
        "custrecord_location_budget",
        "custrecord_cost_center_budget",
        "custrecord_deparment_tagging",
      ],
    };
    return getSearch(req.type, req.filters, req.columns);
  }

  return {
    onRequest: onRequest,
  };
});

function geOldSubLine(sublist, lineuniquekey) {
  log.debug("sublist", sublist);
  log.debug("lineuniquekey", lineuniquekey);
  if (MODE == "edit") {
    if (sublist == "item") {
      var res = ITEM_LIST.filter(function (c, i, a) {
        if (toNum(lineuniquekey) >= 0) {
          if (c.custcol_line_unique_key == lineuniquekey) return c;
        } else {
          // if (c.item == item && i == index)
          //     return c;
        }
      });
      log.debug("old line found", res);
      //line is found in old record
      if (res.length > 0) {
        return res[0];
      }
    } else {
      var res = EXPENSE_LIST.filter(function (c, i, a) {
        if (lineuniquekey) {
          if (c.custcol_line_unique_key == lineuniquekey) return c;
        } else {
          // if (c.account == item && i == index)
          //     return c;
        }
      });

      //line is found in old record
      if (res.length > 0) {
        return res[0];
      }
    }
  }
}

/*--------------------------HELPER FNS----------------------------------------*/
function sum(arr, k) {
  if (Array.isArray(arr)) {
    var ar;
    if (k)
      ar = arr.map(function (x) {
        return toNum(x[k]);
      });
    else ar = arr;

    return ar.reduce(function (a, b) {
      return a + b;
    }, 0);
  } else if (Array.isArray(k) && typeof arr === "object") {
    var values = k.map(function (c) {
      return arr[c];
    });
    return sum(values);
  }
}

function toNum(s) {
  s = parseFloat(s);
  if (isNaN(s)) return 0;
  else return roundToTwo(s);
}

function toNumRaw(s) {
  s = parseFloat(s);
  if (isNaN(s)) return 0;
  else return s;
}

function getLines(rec, sublist, cols) {
  var result = [];
  var lineCount = rec.getLineCount(sublist);
  for (var i = 0; i < lineCount; i++) {
    var row = {
      line: i,
      index: i,
    };
    for (var j = 0; j < cols.length; j++) {
      try {
        row[cols[j]] = rec.getSublistValue({
          fieldId: cols[j],
          sublistId: sublist,
          line: i,
        });
      } catch (e) {
        // log.error("getLines:getSublistValue failed",e)
      }
      try {
        row[cols[j] + "_txt"] = rec.getSublistText({
          fieldId: cols[j],
          sublistId: sublist,
          line: i,
        });
      } catch (e) {
        // log.error("getLines:getSublistText failed",e)
      }
    }
    result.push(row);
  }
  return result;
}

function getValue(rec, fieldId) {
  return rec.getValue({
    fieldId: fieldId,
  });
}

function setValue(rec, fieldId, value) {
  return rec.setValue({
    fieldId: fieldId,
    value: value,
  });
}

function getLine(rec, sublist, col, line) {
  if (Array.isArray(col)) {
    var result = {};
    for (var key in col) {
      result[key] = rec.getSublistValue({
        sublistId: sublist,
        fieldId: key,
        line: line,
      });
    }
    return result;
  } else {
    return rec.getSublistValue({
      sublistId: sublist,
      fieldId: col,
      line: line,
    });
  }
}

function getLineText(rec, sublist, col, line) {
  if (Array.isArray(col)) {
    var result = {};
    for (var key in col) {
      result[key] = rec.getSublistText({
        sublistId: sublist,
        fieldId: key,
        line: line,
      });
    }
    return result;
  } else {
    return rec.getSublistText({
      sublistId: sublist,
      fieldId: col,
      line: line,
    });
  }
}

function getSearch(type, filters, columns) {
  try {
    const HARD_LIMIT = 10000;
    var dynamic_search;
    if (typeof type === "string" || type instanceof String) {
      dynamic_search = SEARCH.create({
        type: type,
        filters: filters,
        columns: columns,
      });
    } else {
      dynamic_search = type;
      columns = JSON.parse(JSON.stringify(dynamic_search)).columns;
    }

    var result_out = [];
    var myPagedData = dynamic_search.runPaged({ pageSize: 1000 });
    myPagedData.pageRanges.forEach(function (pageRange) {
      if (result_out.length < HARD_LIMIT) {
        var myPage = myPagedData.fetch({
          index: pageRange.index,
        });
        myPage.data.forEach(function (res) {
          var values = {
            id: res.id,
          };
          //iterate over the collection of columns for the value
          columns.forEach(function (c, i, a) {
            var key_name = "";

            if (c.join) key_name = c.join + "_" + c.name;
            else if (c.name.indexOf("formula") > -1)
              key_name = c.name + "_" + i;
            else key_name = c.name;

            var value = res.getText(c);

            if (value == null) {
              values[key_name] = res.getValue(c);
            } else {
              values[key_name] = res.getValue(c);

              values[key_name + "_txt"] = res.getText(c);
            }
          });
          result_out.push(values);
        });
      }
    });
    return result_out;
  } catch (e) {
    log.error("getSearch failed due to an exception", e);
    throw e;
  }
}

function getRecord(type, id, cols, map) {
  var rec = RECORD.load({
    type: type,
    id: id,
  });

  var result = {};

  for (var key in cols) {
    result[key] = rec.getValue(key) || "";
    result[key + "_txt"] = rec.getText(key) || "";
  }

  if (Array.isArray(map)) {
    var mapobj = {};
    for (var i = 0; i < map.length; i++) {
      mapobj[map[i]] = result[col[i]];
      mapobj[map[i] + "_txt"] = result[col[i] + "_txt"];
    }
    return mapobj;
  } else {
    return result;
  }
}

function stringify(s) {
  try {
    return JSON.stringify(s, null, 1);
  } catch (e) {
    log.debug("stringify failed", e);
    return "";
  }
}

function showError(title, message) {
  log.error(title, message);
}

function showSuccess(title, message) {
  log.debug(title, message);
}

function groupBy(xs, key) {
  return xs.reduce(function (rv, x) {
    (rv[x[key]] = rv[x[key]] || []).push(x);
    return rv;
  }, {});
}

function getParentId(current, list) {
  //remove the last from the array
  var names_split = current.name.split(" : ");

  //log.debug("names_split",names_split);

  var lookup_pattern = [];

  for (var i = 0; i < names_split.length; i++) {
    var temp = names_split.slice(0, names_split.length - 1 - i);
    //log.debug("temp",temp);
    if (temp.length > 0)
      lookup_pattern.push(
        temp.reduce(function (a, b) {
          return a + " : " + b;
        })
      );
  }
  //log.debug("lookup pattern", lookup_pattern)
  var result = [];

  for (var i = 0; i < lookup_pattern.length; i++) {
    var row = lookup_pattern[i];
    var res = list.filter(function (c) {
      if (c.name == row) {
        return c;
      }
    });
    if (res.length > 0) {
      result.push(res[0]);
    }
  }
  // log.debug("result",result)
  return result;
}

function pick(arrobj, key) {
  if (Array.isArray(arrobj) && typeof key === "string") {
    return arrobj.map(function (c) {
      return c[key];
    });
  } else if (Array.isArray(key) && typeof arrobj === "object") {
    return key.map(function (c) {
      return arrobj[c];
    });
  }
}

function unique(arr, key) {
  if (key) {
    return arr.filter(function (c, i, a) {
      var list = a.map(function (x) {
        return x[key];
      });
      if (list.indexOf(c[key]) == i) return c;
    });
  } else {
    return arr.filter(function (c, i, a) {
      if (a.indexOf(c) == i) return c;
    });
  }
}

function removeNullOrDefault(arr) {
  return arr.filter(function (c) {
    if (c != null && c != undefined && c != "") return c;
  });
}

function isNullorDefault(s) {
  if (s == undefined || s == null || s == "") return true;
  else return false;
}

function isFound(val, arr, key) {
  if (key) {
    var res = arr.filter(function (c) {
      if (c[key] == val) return c;
    });
    if (res.length > 0) return true;
  } else {
    var res = arr.filter(function (c) {
      if (c == val) return c;
    });
    if (res.length > 0) return true;
  }

  return false;
}

Object.assign = function (target) {
  var newTo = Object(target);
  for (var index = 1; index < arguments.length; index++) {
    var nextSource = arguments[index];
    if (nextSource !== null && nextSource !== undefined) {
      for (var nextKey in nextSource) {
        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
          newTo[nextKey] = nextSource[nextKey];
        }
      }
    }
  }
  return newTo;
};

function roundToTwo(num) {
  return +(Math.round(num + "e+2") + "e-2");
}

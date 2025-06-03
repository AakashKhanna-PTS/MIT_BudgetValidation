/**
 *@NApiVersion 2.1
 *@NScriptType UserEventScript
 */
SUITELET_SCRIPT_ID = "customscript_update_consumed_amount_2";
SUITELET_DEPLOY_ID = "customdeploy_update_consumed_amount_2";
define(["N/url"], function (url) {
  function beforeLoad(context) {
    var form = context.form;
    if (context.type == "view") {
      var suiteleturl = url.resolveScript({
        scriptId: SUITELET_SCRIPT_ID,
        deploymentId: SUITELET_DEPLOY_ID,
        params: {
          recordid: context.newRecord.id,
        },
      });
      form.addButton({
        id: "custpage_update_amount",
        label: "Update Consumed amount 2",
        functionName: `window.open('${suiteleturl}')`,
      });
    }
  }

  return {
    beforeLoad: beforeLoad,
  };
});

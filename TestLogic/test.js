var billSearch = [
  { recordType: "bill123", budgetId: 123, amount: 1000, linked: "po123" },
  { recordType: "bill125", budgetId: 123, amount: 500, linked: "po125" },
  { recordType: "bill123", budgetId: 123, amount: 800, linked: "po123" },
  { recordType: "bill125", budgetId: 123, amount: 1000, linked: "po125" },
  //   { recordType: "bill334", budgetId: 123, amount: 1000, linked: "" },
  //   { recordType: "bill334", budgetId: 123, amount: 2000, linked: "" },
  //   { recordType: "bill123", budgetId: 123, amount: 3000, linked: "po123" },
  //   { recordType: "bill124", budgetId: 123, amount: 4000, linked: "po124" },
  //   { recordType: "bill124", budgetId: 123, amount: 12000, linked: "po124" },
  //   { recordType: "bill123", budgetId: 123, amount: 1500, linked: "po123" },
  //   { recordType: "bill125", budgetId: 123, amount: 1600, linked: "po125" },
];

var poSearch = [
  { recordType: "po123", budgetId: 123, amount: 1000, linked: "pr123" },
  { recordType: "po125", budgetId: 123, amount: 500, linked: "pr125" },
  { recordType: "po123", budgetId: 123, amount: 800, linked: "pr123" },
  { recordType: "po125", budgetId: 123, amount: 1000, linked: "pr125" },
  //   { recordType: "po333", budgetId: 123, amount: 600, linked: "" },
  //   { recordType: "po333", budgetId: 123, amount: 7000, linked: "" },
  //   { recordType: "po123", budgetId: 123, amount: 2000, linked: "pr123" },
  { recordType: "po124", budgetId: 123, amount: 3000, linked: "pr124" },
  { recordType: "po124", budgetId: 123, amount: 3000, linked: "pr124" },
  //   { recordType: "po123", budgetId: 123, amount: 1900, linked: "pr123" },
  //   { recordType: "po125", budgetId: 123, amount: 2000, linked: "pr125" },
];

var prSearch = [
  { recordType: "pr123", budgetId: 123, amount: 2000, linked: "" },
  { recordType: "pr125", budgetId: 123, amount: 4000, linked: "" },
  //   { recordType: "pr123", budgetId: 123, amount: 3000, linked: "" },
  //   { recordType: "pr125", budgetId: 123, amount: 4900, linked: "" },
  //   { recordType: "pr", budgetId: 123, amount: 500, linked: "" },
  //   { recordType: "pr", budgetId: 123, amount: 7000, linked: "" },
  //   { recordType: "pr123", budgetId: 123, amount: 2000, linked: "" },
  { recordType: "pr124", budgetId: 123, amount: 5000, linked: "" },
  //   { recordType: "pr124", budgetId: 123, amount: 10000, linked: "" },
  //   { recordType: "pr123", budgetId: 123, amount: 2000, linked: "" },
  //   { recordType: "pr125", budgetId: 123, amount: 1900, linked: "" },
];

function gatherTheUnusedAmount(vcList, billList, poList, prList) {
  var vcGroup = groupBy(vcList, "linked");
  var billGroupDeduct = groupBy(billList, "recordType");
  var billBalance = reduceTheAmount(vcGroup, billGroupDeduct);

  var billGroup = groupBy(billSearch, "linked");
  var poGroup1 = groupBy(poSearch, "recordType");
  var poBalance = reduceTheAmount(billGroup, poGroup1);

  var poGroup = groupBy(poSearch, "linked");
  var prGroup = groupBy(prSearch, "recordType");
  var prBalanceAmount = reduceTheAmount(poGroup, prGroup);
}

var billGroup = groupBy(billSearch, "linked");
var poGroup1 = groupBy(poSearch, "recordType");
var poBalance = reduceTheAmount(billGroup, poGroup1);

var poGroup = groupBy(poSearch, "linked");
var prGroup = groupBy(prSearch, "recordType");
var prBalanceAmount = reduceTheAmount(poGroup, prGroup);

console.log(billGroup);
console.log(poGroup);
console.log(prGroup);
console.log("difference", prBalanceAmount);
console.log("difference2 ", poBalance);
function reduceTheAmount(poGroup, prGroup) {
  var sum = 0;
  for (let key in poGroup) {
    if (key == "empty") {
      continue;
    }
    if (!prGroup[key]) {
      prGroup[key] = 0;
    }
    var calc = prGroup[key] - poGroup[key];
    if (calc > 0) {
      sum += calc;
    }
  }

  return sum;
}
function groupBy(arr, key) {
  var groupedObj = {};
  for (let i = 0; i < arr.length; i++) {
    var objKey = arr[i][key];
    if (objKey == "") {
      objKey = "empty";
    }
    if (groupedObj[objKey]) {
      groupedObj[objKey] += arr[i].amount;
    } else {
      groupedObj[objKey] = 0;
      groupedObj[objKey] += arr[i].amount;
    }
  }
  return groupedObj;
}

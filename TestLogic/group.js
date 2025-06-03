function print(key) {
  var obj = { name: "vasi", age: 23, rank: 3, phone: 3436754678 };
  console.log(obj[key]);
}

var billSearch = [
  { recordType: "bill123", budgetId: 123, amount: 1000, linked: "po123" },
  { recordType: "bill125", budgetId: 123, amount: 100, linked: "po125" },
  { recordType: "bill123", budgetId: 123, amount: 2000, linked: "po123" },
  { recordType: "bill125", budgetId: 123, amount: 1000, linked: "po125" },
  { recordType: "bill334", budgetId: 123, amount: 1000, linked: "" },
  { recordType: "bill334", budgetId: 123, amount: 2000, linked: "" },
  { recordType: "bill123", budgetId: 123, amount: 3000, linked: "po123" },
  { recordType: "bill124", budgetId: 123, amount: 4000, linked: "po124" },
  { recordType: "bill124", budgetId: 123, amount: 12000, linked: "po124" },
  { recordType: "bill123", budgetId: 123, amount: 1500, linked: "po123" },
  { recordType: "bill125", budgetId: 123, amount: 1600, linked: "po125" },
];

function groupBy(inputArray, groupkey) {
  var result = {};
  for (let i = 0; i < inputArray.length; i++) {
    var value = inputArray[i][groupkey];

    if (value in result) {
      result[value].push(inputArray[i]);
    } else {
      result[value] = [];
      result[value].push(inputArray[i]);
    }
  }
  return result;
}

console.log(groupBy(billSearch, "budgetId"));

//input array output object
//result

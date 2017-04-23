var mongoose = require("mongoose");
var Schema = mongoose.Schema;

var FlightSchema = new Schema({
  user_id: {type: String},
  originPlace: {type: String},
  destinationPlace: {type: String},
  outboundPartialDate : {type: String},
  time: {type: String},
  person_number: {type: Number},

});

module.exports = mongoose.model("Movie", MovieSchema);

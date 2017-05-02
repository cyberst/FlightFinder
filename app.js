var express = require("express");
var request = require("request");
var bodyParser = require("body-parser");
var mongoose = require("mongoose");

var db = mongoose.connect(process.env.MONGODB_URI);
var Movie = require("./models/flight");

var app = express();

app.use(bodyParser.urlencoded({extended: false}));
app.use(bodyParser.json());
app.listen((process.env.PORT || 5000));


var query = {
  originPlace: {type: String},
  destinationPlace: {type: String},
  outboundPartialDate : {type: String},
  carrier_id: {type: String},
  person_number: {type: Number}
};
var found_flight = {
  originPlace: {type: String},
  destinationPlace: {type: String},
  outboundPartialDate : {type: String},
  carrier_id: {type: String},
  person_number: {type: Number}
};

// Server index page
app.get("/", function (req, res) {
  res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
app.get("/bot", function (req, res) {
  if (req.query["hub.verify_token"] === "verify_token_ali") {
    console.log("Verified webhook");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Verification failed. The tokens do not match.");
    res.sendStatus(403);
  }
});

// All callbacks for Messenger will be POST-ed here
app.post("/bot", function (req, res) {
  // Make sure this is a page subscription
  if (req.body.object == "page") {
    // Iterate over each entry
    // There may be multiple entries if batched
    req.body.entry.forEach(function(entry) {
      // Iterate over each messaging event
      entry.messaging.forEach(function(event) {
        if (event.postback) {
          processPostback(event);
        }else if(event.message){
          processMessage(event);
        }
      });
    });

    res.sendStatus(200);
  }
});

function processPostback(event) {
  var senderId = event.sender.id;
  var payload = event.postback.payload;

  if (payload === "Greeting") {
    // Get user's first name from the User Profile API
    // and include it in the greeting
    request({
      url: "https://graph.facebook.com/v2.6/" + senderId,
      qs: {
        access_token: process.env.PAGE_ACCESS_TOKEN,
        fields: "first_name"
      },
      method: "GET"
    }, function(error, response, body) {
      var greeting = "";
      if (error) {
        console.log("Error getting user's name: " +  error);
      } else {
        var bodyObj = JSON.parse(body);
        name = bodyObj.first_name;
        greeting = "Hi " + name + ". ";
      }
      var message = greeting + "Welcome to Flight Finder! Where would you like to fly?";
      sendMessage(senderId, {text: message});
    });
  }
}

function processMessage(event) {
  if (!event.message.is_echo) {
    var message = event.message;
    var senderId = event.sender.id;
    console.log("Received message from senderId: " + senderId);
    console.log("Message is: " + JSON.stringify(message));

    // You may get a text or attachment but not both
    if (message.text) {
      var formattedMsg = message.text.toLowerCase().trim();
      var Words =formattedMsg.match('[a-zA-Z]+')
      console.log(Words);

      // If we receive a text message, check to see if it matches any special
      // keywords and send back the corresponding movie detail.
      // Otherwise, search for new movie.
      switch (Words[0]) {
        case "destination":
          query.destinationPlace = formattedMsg.substr(formattedMsg.indexOf(" ") + 1);
          AutosuggestPlace(senderId, "Destination", query.destinationPlace);
          break;
        case "origin":
          query.originPlace=formattedMsg.substr(formattedMsg.indexOf(" ") + 1);
          AutosuggestPlace(senderId, "Origin", query.originPlace);
          break;
        case "date":
          query.outboundPartialDate = formattedMsg.substr(formattedMsg.indexOf(" ") + 1);
          found_flight.outboundPartialDate = query.outboundPartialDate;
          sendMessage(senderId, {text: "Shall I look for the flight?"});
          break;
        case "yes":
          requestFlight(senderId);
        /*case "director":
        case "cast":
        case "rating":*/

        default:
          sendMessage(senderId, {text: "Sorry, I don't understand your request."});
      }
    } else if (message.attachments) {
      sendMessage(senderId, {text: "Sorry, I don't understand your request."});
    }
  }
}

function requestFlight(userId){
  request("http://partners.api.skyscanner.net/apiservices/browsequotes/v1.0/US/USD/en-GG/" + query.originPlace + "/" + query.destinationPlace + "/" + query.outboundPartialDate + "/?apiKey=" + process.env.API_KEY, function (error, response, body) {
    if (response.statusCode === 200) {
      var flight=JSON.parse(body);
      if(flight.Quotes[0]){

        var carrier_name;
        flight.Carriers.forEach(findCarrier(flight.Quotes[0].OutboundLeg.CarrierIds[0],carrier_name));

        var message = "The cheapest flight from " + found_flight.originPlace + "to" + found_flight.destinationPlace + "on" + found_flight.outboundPartialDate + "is" + flight.Quotes[0].MinPrice + "dollars with" + carrier_name;
        sendMessage(userId, {text: message});

      }

    }
  })

}

function findCarrier(id, name){
  if(id === CarrierId){
    name=Name;
  }
}

function AutosuggestPlace(userId, input, query){

  request("http://partners.api.skyscanner.net/apiservices/autosuggest/v1.0/US/USD/en-GG?"+"query="+query+"&apiKey=" + process.env.API_KEY, function (error, response, body) {
    if (response.statusCode === 200) {
        var placeObject=JSON.parse(body);
        //console.log(Array.isArray(placeObject.Places))
        console.log(placeObject.Places[0]);

        if(placeObject.Places[0]){
          if(input==="Destination"){
            query.destinationPlace=placeObject.Places[0].PlaceId;
            found_flight.destinationPlace=placeObject.Places[0].PlaceName;
            console.log("Received Destination Information");
            sendMessage(userId, {text: "Where do you want to leave from?"});
          }
          else if(input==="Origin"){
            query.originPlace=placeObject.Places[0].PlaceId;
            found_flight.originPlace=placeObject.Places[0].PlaceName;
            console.log("Received Origin Information",query.originPlace);
            sendMessage(userId, {text: "When do you want to fly? Please enter the date as yyyy mm dd or yyyy mm"});
          }

        }
        else{
          sendMessage(userId, {text: "Could not find place."});
        }
    }
    else {
    sendMessage(userId, {text: "Something went wrong. Try again."});
    }
  });


}

// sends message to user
function sendMessage(recipientId, message) {
  request({
    url: "https://graph.facebook.com/v2.6/me/messages",
    qs: {access_token: process.env.PAGE_ACCESS_TOKEN},
    method: "POST",
    json: {
      recipient: {id: recipientId},
      message: message,
    }
  }, function(error, response, body) {
    if (error) {
      console.log("Error sending message: " + response.error);
    }
  });
}

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
  user_id: {type: String},
  originPlace: {type: String},
  destinationPlace: {type: String},
  outboundPartialDate : {type: String},
  time: {type: String},
  person_number: {type: Number}
};

// Server index page
app.get("/", function (req, res) {
  res.send("Deployed!");
});

// Facebook Webhook
// Used for verification
app.get("/webhook", function (req, res) {
  if (req.query["hub.verify_token"] === "verify_token_ali") {
    console.log("Verified webhook");
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    console.error("Verification failed. The tokens do not match.");
    res.sendStatus(403);
  }
});

// All callbacks for Messenger will be POST-ed here
app.post("/webhook", function (req, res) {
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
      console.log(Words[0]);

      // If we receive a text message, check to see if it matches any special
      // keywords and send back the corresponding movie detail.
      // Otherwise, search for new movie.
      switch (Words[0]) {
        case "destination":
          query.destinationPlace = formattedMsg.substr(formattedMsg.indexOf(" ") + 1);
          console.log("Received Destination Information");
          AutosuggestPlace("Destination");
          sendMessage(senderId, {text: "Where do you want to leave from?"});
          break;
        /*  case "date":
        case "runtime":
        case "director":
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

function AutosuggestPlace(input){
  if(input === "Destination"){
    request("http://partners.api.skyscanner.net/apiservices/autosuggest/v1.0/US/USD/en-GG?"+"query="+query.destinationPlace+"&apiKey=" + process.env.API_KEY, function (error, response, body) {
      if (response.statusCode === 200) {
          var placeObject=JSON.parse(body)
          query.destinationPlace=placeObject.Places[0].PlaceId;
      }
      else {
      sendMessage(userId, {text: "Something went wrong. Try again."});
      }
    });

  }

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

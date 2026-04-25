const log = require("./log.js").log;
const Ban = require("./ban.js");
const Flood = require("./flood.js");
const Utils = require("./utils.js");
const io = require('./index.js').io;
const settings = require("./settings.json");
const sanitize = require('sanitize-html');
var fs = require("fs");

// moving colors to a much simpler, much easier to edit config. (i'm sorry colin)
var colors = fs.readFileSync("./colors.txt").toString().replace(/\r/,"").split("\n");
var blacklist = fs.readFileSync("./blacklist.txt").toString().replace(/\r/,"").split("\n");
var colorBlacklist = fs.readFileSync("./colorWhitelist.txt").toString().replace(/\r/,"").split("\n");

let roomsPublic = [];
let rooms = {};
let usersAll = [];
var clientslowmode = [];

exports.beat = function() {
    io.on('connection', function(socket) {
        var ip = socket.handshake.headers["cf-connecting-ip"]
              || socket.request.connection.remoteAddress;
        // Drop banned IPs immediately
        if (Ban.isBanned(ip)) {
            Ban.handleBan(socket);
            return;
        }
        // Connection-rate flood guard (per IP)
        var c = Flood.checkConnection(ip);
        if (!c.allow) {
            try { socket.emit('login_error', c.reason); } catch (e) {}
            socket.disconnect(true);
            return;
        }
        new User(socket);
    });
};

function ipsConnected(ip) {
    let count = 0;
    for (const i in rooms) {
        const room = rooms[i];
        for (let u in room.users) {
            const user = room.users[u];
            if (user.getIp() == ip) {
                count++;
            }
        }
    }
    return count;
}
//I'M SORRY COLIN

function filtertext(tofilter){
  var filtered = false;
  blacklist.forEach(listitem=>{
    if(tofilter.includes(listitem)) filtered = true;
  })
  return filtered;
}

function checkRoomEmpty(room) {
    if (room.users.length != 0) return;

    log.info.log('info', 'removeRoom', {
        room: room
    });

    let publicIndex = roomsPublic.indexOf(room.rid);
    if (publicIndex != -1)
        roomsPublic.splice(publicIndex, 1);
    
    room.deconstruct();
    delete rooms[room.rid];
    delete room;
}

class Room {
    constructor(rid, prefs) {
        this.rid = rid;
        this.prefs = prefs;
        this.users = [];
    }

    deconstruct() {
        try {
            this.users.forEach((user) => {
                user.disconnect();
            });
        } catch (e) {
            log.info.log('warn', 'roomDeconstruct', {
                e: e,
                thisCtx: this
            });
        }
        //delete this.rid;
        //delete this.prefs;
        //delete this.users;
    }

    isFull() {
        return this.users.length >= this.prefs.room_max;
    }

    join(user) {
        user.socket.join(this.rid);
        this.users.push(user);

        this.updateUser(user);
    }

    leave(user) {
        // HACK
        try {
            this.emit('leave', {
                 guid: user.guid
            });
     
            let userIndex = this.users.indexOf(user);
     
            if (userIndex == -1) return;
            this.users.splice(userIndex, 1);
     
            checkRoomEmpty(this);
        } catch(e) {
            log.info.log('warn', 'roomLeave', {
                e: e,
                thisCtx: this
            });
        }
    }

    updateUser(user) {
                this.emit('update', {
                        guid: user.guid,
                        userPublic: user.public
        });
    }

    getUsersPublic() {
        let usersPublic = {};
        this.users.forEach((user) => {
            usersPublic[user.guid] = user.public;
        });
        return usersPublic;
    }

    emit(cmd, data) {
                io.to(this.rid).emit(cmd, data);
    }
}

function newRoom(rid, prefs) {
    rooms[rid] = new Room(rid, prefs);
    log.info.log('info', 'newRoom', {
        rid: rid
    });
}

function _emitMedia(kind, urlRaw) {
    if (typeof urlRaw !== "string") return;
    if (urlRaw.includes("\"") || urlRaw.includes("'") || urlRaw.includes("<") || urlRaw.includes(">")) {
        this.room.emit("talk", {
            guid: this.guid,
            text: "I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDI LMAO"
        });
        return;
    }
    var ok = /^https?:\/\/[^\s]+$/i.test(urlRaw) || /^\/uploads\/[A-Za-z0-9._-]+$/.test(urlRaw);
    if (!ok) {
        this.socket.emit('commandFail', { reason: kind + "_url" });
        return;
    }
    if (urlRaw.length > 2048) return;
    var url = this.private.sanitize ? sanitize(urlRaw) : urlRaw;
    this.room.emit(kind, {
        guid: this.guid,
        url: url
    });
}

let userCommands = {
    "godmode": function(word) {
        let success = word == this.room.prefs.godword;
        if (success) {
            this.private.runlevel = 3;
            this.public.name = "<font color=\"red\">" + this.public.name + "</font>"
            this.room.updateUser(this);
            this.socket.emit("authlevel",{level:3});
        }
        log.info.log('info', 'godmode', {
            guid: this.guid,
            success: success
        });
    },
    "mod_code": function(word) {
        let success = word == this.room.prefs.mod_code;
        if (success) {
            this.public.name = "<font color=\"green\">" + this.public.name + "</font>"
            this.private.runlevel = 2;
            this.room.updateUser(this);
            this.socket.emit("authlevel",{level:2});
        }
        log.info.log('info', 'mod_code', {
            guid: this.guid,
            success: success
        });
    },
    "dev_code": function(word) {
        let success = word == this.room.prefs.dev_code;
        if (success) {
                        this.public.name = "<font color=\"orange\">" + this.public.name + "</font>"
                        this.private.runlevel = 3;
                        this.room.updateUser(this);
                        this.socket.emit("authlevel",{level:3});
                }
        log.info.log('info', 'dev_code', {
            guid: this.guid,
            success: success
        });
    },
    "techy": function(word) {
        let success = word == this.room.prefs.techy;
        if (success) {
            this.public.name = "<font color=\"purple\">" + this.public.name + "</font>"
            this.private.runlevel = 4;
            this.private.sanitize = "off";
            this.room.updateUser(this);
            this.socket.emit("authlevel",{level:4});
        }
        log.info.log('info', 'techy', {
            guid: this.guid,
            success: success
        });
    },
        update: function() {
                if(this.private.level<=2) return;
                //Just re-read the settings.
                colors = fs.readFileSync("./colors.txt").toString().replace(/\r/,"").split("\n");
                blacklist = fs.readFileSync("./blacklist.txt").toString().replace(/\r/,"").split("\n");
                colorBlacklist = fs.readFileSync("./colorWhitelist.txt").toString().replace(/\r/,"").split("\n");
        },
    "real_code": function(word) {
        let success = word == this.room.prefs.real_code;
        if (success) {
            this.public.name = "<font color=\"blue\">" + this.public.name + "</font>"
            this.room.updateUser(this);
        }
        log.info.log('info', 'real_code', {
            guid: this.guid,
            success: success
        });
    },
    "sanitize": function() {
        let sanitizeTerms = ["false", "off", "disable", "disabled", "f", "no", "n"];
        let argsString = Utils.argsString(arguments);
        this.private.sanitize = !sanitizeTerms.includes(argsString.toLowerCase());
    }, 
    "kick": function (data) {
        let pu = this.room.getUsersPublic()[data];
        if (pu && pu.color) {
            let target;
            this.room.users.map((n) => {
                if (n.guid == data) {
                    target = n;
                }
            });
            
            if (target.private.runlevel < 2) {
                target.socket.emit("kick", {
                    reason: "You got kicked.<br>Kicked by "+this.public.name,
                });
                target.disconnect();
                target.socket.disconnect();
            }
        }
    },
    "zombify": function (data) {
        let pu = this.room.getUsersPublic()[data];
        if (pu && pu.color) {
            let target;
            this.room.users.map((n) => {
                if (n.guid == data) {
                    target = n;
                }
            });
            
            if (target.private.runlevel < 2) {
                target.public.color = "undead";
                                this.room.updateUser(target);
            }
        }
    },
    "joke": function() {
        this.room.emit("joke", {
            guid: this.guid,
            rng: Math.random()
        });
    }, 
    "fact": function() {
        this.room.emit("fact", {
            guid: this.guid,
            rng: Math.random()
        });
    },
    "image": function(urlRaw) { _emitMedia.call(this, "image", urlRaw); },
    "video": function(urlRaw) { _emitMedia.call(this, "video", urlRaw); },
    "audio": function(urlRaw) { _emitMedia.call(this, "audio", urlRaw); },
    "youtube": function(vidRaw) {
        if(vidRaw.includes("\"")){
            this.room.emit("talk", {
                guid: this.guid,
                text:"I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDI LMAO"
            }); 
            return;
        }
        if(vidRaw.includes("'")){ 
            this.room.emit("talk", {
                guid: this.guid,
                text:"I'M PRETENDING TO BE A 1337 HAX0R BUT I'M ACTUALLY A SKRIPT KIDDI LMAO"
            }); 
            return;
        }
        var vid = this.private.sanitize ? sanitize(vidRaw) : vidRaw;
        this.room.emit("youtube", {
            guid: this.guid,
            vid: vid
        });
    },
    "color": function(param) {
                var victim = this;
                if (colors.includes(param)) {
                        param = param.toLowerCase();
                        victim.public.color = param;
                        this.room.updateUser(victim);
                } else {
                        param = colors[Math.floor(Math.random() * colors.length)];      
                        victim.public.color = param;
                        this.room.updateUser(victim);
                }
    },
    "pope": function() {
        this.public.color = "pope";
        this.room.updateUser(this);
    },
    "name": function() {
        let argsString = Utils.argsString(arguments);
        if (argsString.length > this.room.prefs.name_limit)
            return;

        let name = argsString || this.room.prefs.defaultName + Math.floor(Math.random() * 10001);
        this.public.name = this.private.sanitize ? sanitize(name) : name;
        if (this.private.runlevel >= 4) {
            this.public.name = "<font color=\"purple\">" + this.private.sanitize ? sanitize(name) : name + "</font>"    
        } else if (this.private.runlevel == 3) {
            this.public.name = "<font color=\"red\">" + this.private.sanitize ? sanitize(name) : name + "</font>"    
        } else if (this.private.runlevel == 2) {
            this.public.name = "<font color=\"green\">" + this.private.sanitize ? sanitize(name) : name + "</font>"    
        }
        this.room.updateUser(this);
    },
    "pitch": function(pitch) {
        pitch = parseInt(pitch);

        if (isNaN(pitch)) return;

        this.public.pitch = Math.max(
            Math.min(
                parseInt(pitch),
                this.room.prefs.pitch.max
            ),
            this.room.prefs.pitch.min
        );

        this.room.updateUser(this);
    },
    "speed": function(speed) {
        speed = parseInt(speed);

        if (isNaN(speed)) return;

        this.public.speed = Math.max(
            Math.min(
                parseInt(speed),
                this.room.prefs.speed.max
            ),
            this.room.prefs.speed.min
        );
        
        this.room.updateUser(this);
    },
        "linux": "passthrough",
        "pawn": "passthrough",
        "bees": "passthrough",
    "asshole": function() {
        this.room.emit("asshole", {
            guid: this.guid,
            target: sanitize(Utils.argsString(arguments))
        });
    },
    "youtuber_code": function(word) {
        let success = word == this.room.prefs.youtuber_code;
        if (success) {
            this.public.name = "<font color=\"maroon\">" + this.public.name + "</font>";
            this.private.runlevel = 0.5;
            this.room.updateUser(this);
            this.socket.emit("authlevel", { level: 0.5 });
        }
        log.info.log('info', 'youtuber_code', {
            guid: this.guid,
            success: success
        });
    }
};



class User {
    constructor(socket) {
        this.guid = Utils.guidGen();
        this.socket = socket;

        // Handle ban
            if (Ban.isBanned(this.getIp())) {
            Ban.handleBan(this.socket);
        }

                if (clientslowmode.includes(this.getIp())) {
                  this.socket.emit("login_error", `Client slowmode. Try again in ${Math.round(1500/1000)} seconds.`);
                  return;
                }
                else {
                  clientslowmode.push(this.getIp());
                  setTimeout(() => {
                    for (var i = 0; i < clientslowmode.length; ++i)
                      if (clientslowmode[i] == this.getIp()) {
                        clientslowmode.splice(i, 1);
                        break;
                      }
                  }, 1500);
                }
        this.private = {
            login: false,
            sanitize: true,
            runlevel: 0
        };

        this.public = {
            color: colors[Math.floor(
                Math.random() * colors.length
            )]
        };
                //never log ips
        log.access.log('info', 'connect', {
            guid: this.guid//,
            //ip: this.getIp()
        });
                
                this.shouldTalkAgain = true
       this.socket.on('login', this.login.bind(this));
    }

    getIp() {
        return this.socket.handshake.headers["cf-connecting-ip"] || this.socket.request.connection.remoteAddress;
    }

    getPort() {
        return this.socket.handshake.address.port;
    }

    login(data) {
        if (typeof data != 'object') return; // Crash fix (issue #9)
        
        if (this.private.login) return;

                log.info.log('info', 'login', {
                        guid: this.guid,
        });
        
        let rid = data.room;
        
                // Check if room was explicitly specified
                var roomSpecified = true;

                // If not, set room to public
                if ((typeof rid == "undefined") || (rid === "")) {
                        rid = roomsPublic[Math.max(roomsPublic.length - 1, 0)];
                        roomSpecified = false;
                }
                log.info.log('info', 'roomSpecified', {
                        guid: this.guid,
                        roomSpecified: roomSpecified
        });
        if (ipsConnected(this.getIp()) > 1) {
                        log.info.log('info', 'loginFail', {
                                guid: this.guid,
                                reason: "toomuch"
                        });
                        return this.socket.emit("loginFail", {
                                reason: "toomuch"
                        });
                }
                // If private room
                if (roomSpecified) {
            if (sanitize(rid) != rid) {
                this.socket.emit("loginFail", {
                    reason: "nameMal"
                });
                return;
            }

                        // If room does not yet exist
                        if (typeof rooms[rid] == "undefined") {
                                // Clone default settings
                                var tmpPrefs = JSON.parse(JSON.stringify(settings.prefs.private));
                                // Set owner
                                tmpPrefs.owner = this.guid;
                newRoom(rid, tmpPrefs);
                        }
                        // If room is full, fail login
                        else if (rooms[rid].isFull()) {
                                log.info.log('info', 'loginFail', {
                                        guid: this.guid,
                                        reason: "full"
                                });
                                return this.socket.emit("loginFail", {
                                        reason: "full"
                                });
                        }
                // If public room
                } else {
                        // If room does not exist or is full, create new room
                        if ((typeof rooms[rid] == "undefined") || rooms[rid].isFull()) {
                                rid = Utils.guidGen();
                                roomsPublic.push(rid);
                                // Create room
                                newRoom(rid, settings.prefs.public);
                        }
        }
        
        this.room = rooms[rid];

        // Check name
                this.public.name = sanitize(data.name) || this.room.prefs.defaultName + Math.floor(Math.random() * 10001);

                if (this.public.name.length > this.room.prefs.name_limit)
                        return this.socket.emit("loginFail", {
                                reason: "nameLength"
                        });
        
                if (this.room.prefs.speed.default == "random")
                        this.public.speed = Utils.randomRangeInt(
                                this.room.prefs.speed.min,
                                this.room.prefs.speed.max
                        );
                else this.public.speed = this.room.prefs.speed.default;

                if (this.room.prefs.pitch.default == "random")
                        this.public.pitch = Utils.randomRangeInt(
                                this.room.prefs.pitch.min,
                                this.room.prefs.pitch.max
                        );
                else this.public.pitch = this.room.prefs.pitch.default;

        // Join room
        this.room.join(this);

        this.private.login = true;
        this.socket.removeAllListeners("login");

                // Send all user info
                this.socket.emit('updateAll', {
                        usersPublic: this.room.getUsersPublic(),
                        guid: this.guid
                });

                // Send room info
                this.socket.emit('room', {
                        room: rid,
                        isOwner: this.room.prefs.owner == this.guid,
                        isPublic: roomsPublic.indexOf(rid) != -1
                });
        
        this.socket.on('talk', this.talk.bind(this));
        this.socket.on('command', this.command.bind(this));
        this.socket.on('typing', this.typing.bind(this));
        this.socket.on('disconnect', this.disconnect.bind(this));

    }

    typing(data) {
        if (typeof data != 'object') return;
        if (!this.room) return;
        var isTyping = !!data.isTyping;
        // Flood protection: max one typing event per 400ms per user
        var now = Date.now();
        if (this._lastTypingAt && (now - this._lastTypingAt) < 400) return;
        // Also collapse identical repeated state changes
        if (this._lastTypingState === isTyping && this._lastTypingAt && (now - this._lastTypingAt) < 1500) return;
        this._lastTypingAt = now;
        this._lastTypingState = isTyping;
        // Broadcast to everyone else in the room (not the sender)
        this.socket.broadcast.to(this.room.rid).emit('typing', {
            guid: this.guid,
            isTyping: isTyping
        });
    }

    talk(data) {
        if (typeof data != 'object' || typeof data.text != "string") { // Crash fix (issue #9)
            data = {
                text: "HEY EVERYONE LOOK AT ME I'M TRYING TO SCREW WITH THE SERVER LMAO"
            };
                        return;
        }


        if (typeof data.text == "undefined")
            return;

                // Flood / bot protection: rate, dedupe, invisible-char spam
                var floodIp;
                try { floodIp = this.getIp(); } catch (e) { floodIp = null; }
                var fc = Flood.checkTalk(this.guid, floodIp, data.text);
                if (!fc.allow) {
                        if (fc.banned) {
                                try { this.socket.disconnect(true); } catch (e) {}
                        }
                        return;
                }

                if (this.shouldTalkAgain) {
                        
                        log.info.log('info', 'talk', {
                                guid: this.guid,
                                text: data.text
                        });
                
                        let text = this.private.sanitize ? sanitize(data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\[\[/g, "&#91;&#91;")) : data.text;
                        if(filtertext(text)) text = "behh behh behh behh behh behh behh behh behh behh behh behh behh behh behh";
                        if ((this.public.color != "undead" && text.length <= this.room.prefs.char_limit) && (text.length > 0)) {
                                this.room.emit('talk', {
                                        guid: this.guid,
                                        text: text
                                });
                        } else if (this.public.color != "undead" && text.length <= this.room.prefs.char_limit) {
                                text = "behh behh behh behh behh behh behh behh behh behh behh behh behh behh behh";
                        }
                        this.shouldTalkAgain = false;
                        var _this = this;
                        setTimeout(function(){
                                _this.shouldTalkAgain = true;
                        },1500)
                }
    }

    command(data) {
        if (typeof data != 'object') return; // Crash fix (issue #9)

        var command;
        var args;
        
        try {
            var list = data.list;
            command = list[0].toLowerCase();
                        
                        if ((list.join(" ").length <= this.room.prefs.char_limit) && (list.join(" ").length > 0)) {
                                args = list.slice(1);
                
                                log.info.log('info', command, {
                                        guid: this.guid,
                                        args: args
                                });

                                if (this.private.runlevel >= (this.room.prefs.runlevel[command] || 0)) {
                                        // Throttle cosmetic-change commands (bot signature: rapid color/hat/name churn)
                                        if (command === "color" || command === "hat" || command === "name") {
                                                var floodIp2;
                                                try { floodIp2 = this.getIp(); } catch (e) { floodIp2 = null; }
                                                var cc = Flood.checkCosmetic(this.guid, floodIp2);
                                                if (!cc.allow) {
                                                        if (cc.banned) {
                                                                try { this.socket.disconnect(true); } catch (e) {}
                                                        }
                                                        return;
                                                }
                                        }
                                        let commandFunc = userCommands[command];
                                        if (commandFunc == "passthrough") {
                                                
                                                if (this.shouldTalkAgain) {
                        
                                                        this.room.emit(command, {
                                                                "guid": this.guid
                                                        });
                                                                                        
                                                        this.shouldTalkAgain = false;
                                                        var _this = this;
                                                        setTimeout(function(){
                                                                _this.shouldTalkAgain = true;
                                                        },1500)
                                                }
                                        } else {
                                                if (this.shouldTalkAgain) {
                        
                                                        commandFunc.apply(this, args);
                                                                                        
                                                        this.shouldTalkAgain = false;
                                                        var _this = this;
                                                        setTimeout(function(){
                                                                _this.shouldTalkAgain = true;
                                                        },1500)
                                                        
                                                }
                                        }
                                } else
                                        this.socket.emit('commandFail', {
                                                reason: "runlevel"
                                        });
                        }
        } catch(e) {
            log.info.log('info', 'commandFail', {
                guid: this.guid,
                command: command,
                args: args,
                reason: "unknown",
                exception: e
            });
            this.socket.emit('commandFail', {
                reason: "unknown"
            });
        }
    }

    disconnect() {
                let ip = "N/A";
                let port = "N/A";

                try {
                        ip = this.getIp();
                        port = this.getPort();
                } catch(e) { 
                        log.info.log('warn', "exception", {
                                guid: this.guid,
                                exception: e
                        });
                }
                // have you NOT learned your lesson yet?
                log.access.log('info', 'disconnect', {
                        guid: this.guid//,
                        //ip: ip,
                        //port: port
                });
         
        this.socket.broadcast.emit('leave', {
            guid: this.guid
        });
        
        Flood.forgetUser(this.guid);

        this.socket.removeAllListeners('talk');
        this.socket.removeAllListeners('command');
        this.socket.removeAllListeners('typing');
        this.socket.removeAllListeners('disconnect');

        // Tell others this user stopped typing (in case they were)
        if (this.room) {
            this.socket.broadcast.to(this.room.rid).emit('typing', {
                guid: this.guid,
                isTyping: false
            });
        }

        this.room.leave(this);
    }
}

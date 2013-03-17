(function () {
    'use strict';

    var API_SERVER = window.location.hostname + ':9000',
        SITE_URL = 'http://lunasync.ajf.me';

    var mode, socket, player;

    var state = {
        playing: false,
        current: null,
        playlist: []
    }, haveControl = false, chatNick = null;

    function $(id) {
        return document.getElementById(id);
    }

    window.onload = function () {
        var id, control;

        // get them before IE errors out
        if (!Object.prototype.hasOwnProperty.call(window, 'WebSocket')) {
            document.innerHTML = 'lunasync requires a browser that supports WebSocket, such as Google Chrome, Mozilla Firefox, Apple Safari, Opera or Internet Explorer 10. Sorry :(';
            return;
        }

        // disable document-hiding style
        $('site').className = '';

        // display basic UI elements present on all pages
        initBasic();

        // display correct page for URL
        if (window.location.pathname === '/') {
            mode = 'home';
            initHome();
        } else if (window.location.pathname[0] === '/') {
            mode = 'view';
            id = window.location.pathname.substr(1);
            if (window.location.search.substr(0, 9) === '?control=') {
                control = window.location.search.substr(9);
            }
            initView(id, control);
        } else {
            mode = '404';
            init404();
        }
    };

    function doAJAX(method, url, data, callback, errback) {
        var xhr;

        xhr = new XMLHttpRequest();
        xhr.open(method, 'http://' + API_SERVER + url);
        xhr.setRequestHeader('Content-Type', 'application/json; charset=utf-8');
        xhr.onreadystatechange = function () {
            if (xhr.readyState === 4) {
                if (xhr.status === 200) {
                    callback(JSON.parse(xhr.responseText));
                } else {
                    errback(xhr);
                }
            }
        };
        if (data) {
            xhr.send(JSON.stringify(data));
        } else {
            xhr.send();
        }
    }

    function send(msg) {
        socket.send(JSON.stringify(msg));
    }

    function initBasic() {
        $('create-new').onclick = function () {
            var title;

            title = prompt('Enter a title:', '');
            doAJAX('POST', '/new', {
                title: title
            }, function (response) {
                window.location = '/' + response.stream.id + '?control=' + response.stream.secret;
            }, function (xhr) {
                alert('Error while trying to create new sync:\nResponse code:\n' + xhr.status + '\nError message:' + xhr.responseText);
            });
        };
    }

    // homepage
    function initHome() {
        // unhide home page
        $('homepage').className = '';
    }

    // sync viewing page
    function initView(id, control) {
        var url;

        // unhide view page
        $('viewpage').className = '';

        socket = new WebSocket('ws://' + API_SERVER, ['lunasync']);
        socket.onopen = function () {
            // set our stream (subscribe to events) and get info on it
            send({
                type: 'set_stream',
                id: id,
                control: control
            });
        };
        socket.onerror = function (err) {
            $('viewpage').innerHTML = 'Error communicating with server, lost connection:\n' + err;
        };
        socket.onmessage = function (event) {
            var msg, stream, elem;

            msg = JSON.parse(event.data);

            switch (msg.type) {
                case 'stream_info':
                    stream = msg.stream;

                    // display stream title
                    $('title').value = stream.title;

                    // display stream viewing URL
                    $('view-link').value = SITE_URL + '/' + stream.id;

                    // update state
                    state.playing = stream.playing;
                    state.current = stream.current;
                    state.playlist = stream.playlist;

                    // display playlist
                    updatePlaylist();

                    // cue and play correct video
                    state.playing = stream.playing;
                    state.current = stream.current;
                    if (state.current !== null) {
                        player.cueVideoById(state.playlist[state.current].id, stream.time);
                    }
                    if (state.playing) {
                        player.playVideo();
                    }

                    // if we have control of the stream
                    if (msg.control) {
                        haveControl = true;

                        // allow changing title
                        $('title').disabled = false;
                        $('title').onchange = function () {
                            send({
                                type: 'change_title',
                                title: $('title').value
                            });
                        };

                        // unhide control box
                        $('control').className = '';

                        // display stream control URL
                        $('control-link').value = SITE_URL + '/' + stream.id + '?control=' + control;

                        // enable stream controls
                        $('rm-button').disabled = false;
                        $('rm-button').onclick = function () {
                            var i, items = $('playlist').selectedOptions, oldCurrent, current;

                            oldCurrent, current = state.playlist[state.current];

                            // remove selected playlist items
                            for (i = 0; i < items.length; i++) {
                                // if currently playing video being deleted, switch to next
                                if (state.playlist[items[i].index] === current) {
                                    // loop around
                                    if (items[i].index + 1 < state.playlist.length) {
                                        current = state.playlist[items[i].index + 1];
                                    } else {
                                        current = state.playlist[0];
                                    }
                                }
                                state.playlist.splice(items[i].index, 1);
                            }

                            updatePlaylist();

                            // push update to server by overwriting playlist
                            // (this may create race conditions...)
                            send({
                                type: 'update_playlist',
                                playlist: state.playlist
                            });

                            if (current !== state.playlist[state.current]) {
                                if (current !== null && state.playlist.indexOf(current) !== -1) {
                                    current = state.playlist.indexOf(current);
                                    send({
                                        type: 'cue',
                                        current: current
                                    });
                                } else {
                                    send({
                                        type: 'cue',
                                        current: null
                                    });
                                }
                            }
                        };

                        $('play-button').disabled = false;
                        $('play-button').onclick = $('playlist').ondblclick = function () {
                            var cueIndex;

                            if ($('playlist').selectedOptions.length === 0) {
                                cueIndex = 0;
                            } else {
                                cueIndex = $('playlist').selectedOptions[0].index;
                            }

                            send({
                                type: 'cue',
                                current: cueIndex
                            });
                        };

                        $('add-url').disabled = false;
                        $('add-url').onkeypress = function (e) {
                            var videoID;

                            // enter
                            if (e.which === 13) {
                                e.preventDefault();
                                $('add-url').blur();
                                videoID = getVideoID($('add-url').value);
                                if (videoID !== false) {
                                    send({
                                        type: 'add_url',
                                        id: videoID
                                    });
                                    $('add-url').value = '';
                                } else {
                                    alert($('add-url').value + ' is not a valid youtube URL!');
                                }
                                return false;
                            }
                        };
                        $('playlist').disabled = false;
                    }

                    // make chat work
                    $('chatbox').placeholder = 'choose a nick (press enter)';
                    $('chatbox').onkeypress = function (e) {
                        // enter
                        if (e.which === 13) {
                            e.preventDefault();
                            if (chatNick === null) {
                                send({
                                    type: 'set_nick',
                                    nick: $('chatbox').value
                                });
                                $('chatbox').disabled = true;
                            } else {
                                send({
                                    type: 'msg',
                                    msg: $('chatbox').value
                                });
                            }
                            $('chatbox').value = '';
                            return false;
                        }
                    };
                break;
                case 'update_playlist':
                    state.playlist = msg.playlist;
                    updatePlaylist();
                break;
                case 'change_title':
                    $('title').value = msg.title;
                break;
                case 'cue':
                    state.playing = true;
                    state.current = msg.current;
                    if (state.current === null) {
                        player.cueVideoById('');
                    } else {
                        player.cueVideoById(state.playlist[state.current].id);
                        player.playVideo();
                    }
                    updatePlaylist();
                break;
                case 'play':
                    console.log('play');
                    state.playing = true;
                    player.seekTo(msg.time, true);
                    player.playVideo();
                break;
                case 'stop':
                    console.log('stop');
                    state.playing = false;
                    player.seekTo(msg.time, true);
                    player.pauseVideo();
                break;
                case 'join':
                    elem = document.createElement('div');
                    console.log(msg.nick + ' joined chat');
                    elem.appendChild(document.createTextNode(msg.nick + ' joined chat'));
                    $('chatlog').appendChild(elem);
                    $('chatlog').scrollTop = $('chatlog').scrollHeight;
                break;
                case 'leave':
                    elem = document.createElement('div');
                    console.log(msg.nick + ' left chat');
                    elem.appendChild(document.createTextNode(msg.nick + ' left chat'));
                    $('chatlog').appendChild(elem);
                    $('chatlog').scrollTop = $('chatlog').scrollHeight;
                break;
                case 'msg':
                    elem = document.createElement('div');
                    console.log(msg.nick + ': ' + msg.msg);
                    elem.appendChild(document.createTextNode(msg.nick + ': ' + msg.msg));
                    $('chatlog').appendChild(elem);
                    $('chatlog').scrollTop = $('chatlog').scrollHeight;
                break;
                case 'nick_taken':
                    alert('The nick "' + msg.nick + '" ids already taken - choose another one!');
                    $('chatbox').disabled = false;
                break;
                case 'nick_chosen':
                    $('chatbox').placeholder = 'say something (press enter)';
                    chatNick = msg.nick;
                    $('chatbox').disabled = false;
                break;
                case 'error':
                    if (msg.error === 'not_found') {
                        $('viewpage').innerHTML = 'Error: no such stream exists. Did you copy the URL correctly?';
                    } else {
                        $('viewpage').innerHTML = 'Error communicating with server, lost connection:\n' + msg.error;
                    }
                break;
            }
        };
    }

    // "404" page
    function init404() {
        // unhide 404 page
        $('page404').className = '';
    }

    function updatePlaylist() {
        var i, option;

        $('playlist').innerHTML = '';
        for (i = 0; i < state.playlist.length; i++) {
            option = document.createElement('option');
            if (state.current === i) {
                option.appendChild(document.createTextNode('▶ '));
                option.className = 'now-playing';
            }
            option.appendChild(document.createTextNode(state.playlist[i].title));
            option.index = i;
            $('playlist').appendChild(option);
        }
    }

    function getVideoID(url) {
        var pos, pos2;

        if (url.substr(0, 7) === 'http://') {
            url = url.substr(7);
        } else if (url.substr(0, 8) === 'https://') {
            url = url.substr(8);
        } else {
            return false;
        }
        if (url.substr(0, 4) === 'www.') {
            url = url.substr(4);
        }
        if (url.substr(0, 9) === 'youtu.be/') {
            return url.substr(9);
        } else if (url.substr(0, 18) === 'youtube.com/watch?') {
            url = url.substr(18);
            pos = url.indexOf('v=');
            if (pos !== -1) {
                url = url.substr(pos + 2);
                pos2 = url.indexOf('&');
                if (pos2 === -1) {
                    return url;
                } else {
                    return url.substr(0, pos2);
                }
            } else {
                return false;
            }
        }
    }

    window.onYouTubeIframeAPIReady = function () {
        player = new YT.Player('player', {
            height: '480',
            width: '788',
            videoId: '',
            events: {
                'onReady': function (event) {
                    //event.target.playVideo();
                },
                'onStateChange': function (event) {
                    var cueIndex;

                    // if we are controlling
                    if (haveControl) {
                        // if video paused and it was playing according to known state
                        if (event.data === YT.PlayerState.PAUSED && state.playing) {
                            // broadcast state change
                            send({
                                type: 'stop',
                                time: player.getCurrentTime()
                            });
                            state.playing = false;
                            console.log('stop!');
                        // if video started playing and it was paused according to known state
                        } else if (event.data === YT.PlayerState.PLAYING && !state.playing) {
                            // broadcast state change
                            send({
                                type: 'play',
                                time: player.getCurrentTime()
                            });
                            state.playing = true;
                            console.log('play!');
                        // if the video ended
                        } else if (event.data === YT.PlayerState.ENDED) {
                            // if we haven't reached the end of the playlist
                            if (state.current + 1 < state.playlist.length) {
                                // cue next video
                                cueIndex = state.current + 1;
                            } else {
                                // cue first video
                                cueIndex = 0;
                            }

                            state.current = cueIndex;
                            state.playing = true;

                            send({
                                type: 'cue',
                                current: cueIndex
                            });

                            player.cueVideoById(state.playlist[cueIndex].id);
                            player.playVideo();

                            updatePlaylist();
                        }
                    }
                },
                
            }
        });
    };
}());
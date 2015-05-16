import config from "config";
import CodeMirror from "codemirror-compressed";

function parsePart(event, part) {
	part = part.replace(/^ *"?|"? *$/g, '');
	if (!part || part == ',' || part == ';') return;

	var today = new Date();

	var match;
	if (match = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(part)) {
		(event.start || (event.start = {})).dateTime = dTMod(event.start.dateTime || today, parseInt(match[1]), 'hours', parseInt(match[2]), 'minutes');
		(event.end || (event.end = {})).dateTime = dTMod(event.end.dateTime || today, parseInt(match[3]), 'hours', parseInt(match[4]), 'minutes');
	} else if (match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(part)) {
		(event.start || (event.start = {})).dateTime = dTMod(event.start.dateTime || today, parseInt(match[1]), 'fullYear', parseInt(match[2]) - 1, 'month', parseInt(match[3]), 'date');
		(event.end || (event.end = {})).dateTime = dTMod(event.end.dateTime || today, parseInt(match[1]), 'fullYear', parseInt(match[2]) - 1, 'month', parseInt(match[3]), 'date');
	} else {
		event.extraParts.push(part);
	}
}

function parseEvent(event, text) {
	event.extraParts = [];

	for (var part of text.split(/("[^"]+"|,)/)) parsePart(event, part);

	if (event.extraParts) {
		event.summary = event.extraParts.join(', ');
	}

	return event;
}

function createEvent(event) {
	return {summary: '', id: 'local-' + (new Date()).valueOf() + '-' + Math.floor(Math.random() * 1e12)};
}

function renderEvent(event) {
	return event.summary;
}

export var EventsInput = React.createClass({
	componentDidMount: function() {
		this.editor = CodeMirror((elt) => {
			var editor_point = this.refs.editor_point.getDOMNode();
			editor_point.parentNode.replaceChild(elt, editor_point);
		}, {
		});

		this.local_events = localStorage.local_events ? JSON.parse(localStorage.local_events) : [createEvent()];
		this.editor.setValue(this.local_events.map(renderEvent).join("\n"));
		this.editor.on('changes', this.onChanges);
	},
	onChanges: function(cm, changes) {
		if (changes.length != 1) {
			// Possible notes for future expansion; use lineChanges to correct future changes
			alert('Long changes array!');
			console.error(changes);
			return;
		}

		var change = changes[0];

		var origin = change.from.line;
		var newTo = CodeMirror.changeEnd(change);
		var delta = newTo.line - change.to.line;

		var lineChanges = [];
		
		var line = origin;
		if (change.removed[0] || change.text[0]) lineChanges.push({line, kind: 'changed'});
		line++;

		for (var delLine = line; delLine <= change.to.line; delLine++) {
			lineChanges.push({line: delLine, kind: 'deleted'});
		}

		for (var addLine = line; addLine <= newTo.line; addLine++) {
			lineChanges.push({line: addLine, kind: 'added'});
		}

		this.onLineChanges(lineChanges);
	},
	onLineChanges: function(lineChanges) {
		for (var lineChange of lineChanges) {
			switch (lineChange.kind) {
				case 'changed':
					this.local_events[lineChange.line] = parseEvent(this.local_events[lineChange.line], this.editor.getLine(lineChange.line));
					break;
				case 'deleted':
					this.local_events.splice(lineChange.line, 1);
					break;
				case 'added':
					this.local_events.splice(lineChange.line, 0, parseEvent(createEvent(), this.editor.getLine(lineChange.line)));
					break;
			}
		}

		this.onLocalEventsChanged();
		this.startSaveTimeout();
	},
	startSaveTimeout: function(event_text) {
		if (this.saveTimeout != null) clearTimeout(this.saveTimeout);

		this.saveTimeout = setTimeout(() => {
			localStorage['local_events'] = JSON.stringify(this.local_events);
		}, 100);
	},
	onKeyUp: function() {
		this.onChange();
	},
	onEventsChanged: function() {
		this.props.onEventsChanged((this.local_events || []).concat(this.google_events || []));
	},
	onLocalEventsChanged: function() {
		this.onEventsChanged();
	},
	onGoogleEventsChanged: function(events) {
		this.google_events = events;
		this.onEventsChanged();
	},
	render: function() {
		return (
			<section id="text-version">
				<h1>encal</h1>
				<div id="editor-point" ref="editor_point" />
				<EventsInput.GoogleConnect onEventsChanged={this.onGoogleEventsChanged} />
			</section>
		);
	},
});

EventsInput.GoogleConnect = React.createClass({
	getInitialState: function() {
		return {authenticated: null, events: JSON.parse(localStorage['google_events'] || '[]')};
	},
	componentWillMount: function() {
		gapi.load('auth', this.authLoaded);
	},
	render: function() {
		var contents;

		if (this.state.authenticated == null) {
			contents = "Contacting Google...";
		} else if (this.state.authenticated) {
			contents = "Connected to Google";
		} else {
			contents = <a href="#" onClick={this.onConnectClick}>Connect to Google</a>;
		}

		return (
			<div id="google-connect">
				{contents}
			</div>
		);
	},

	calendarLoaded: function() {
		var now = new Date();
		var cur_weekday = now.getDay();
		var start = dTAdd(now, -cur_weekday, 'date');
		start.setHours(0, 0, 0, 0);
		var end = dTAdd(start, 7, 'date');
		console.log(start, end);

		gapi.client.calendar.events.list({
			calendarId: 'primary',
			singleEvents: true,
			timeMin: start.toJSON(),
			timeMax: end.toJSON(),
		}).execute((result) => {
			this.props.onEventsChanged(result.items.filter((event) => {
				return !!event.start.dateTime;
			}).map((event) => {
				event.start.dateTime = new Date(event.start.dateTime);
				event.end.dateTime = new Date(event.end.dateTime);

				return event;
			}));
		});
	},

	checkAuthRequest: function(result) {
		this.setState({authenticated: result && !result.error});

		if (this.state.authenticated) {
			gapi.client.load('calendar', 'v3', this.calendarLoaded);
		}
	},

	onConnectClick: function() {
		gapi.auth.authorize({
			client_id: config.GOOGLE_CLIENT_ID,
			scope: "https://www.googleapis.com/auth/calendar",
			immediate: false
		}, this.checkAuthRequest);
	},

	authLoaded: function() {
		gapi.client.setApiKey(config.GOOGLE_API_KEY);
		gapi.auth.authorize({
			client_id: config.GOOGLE_CLIENT_ID,
			scope: "https://www.googleapis.com/auth/calendar",
			immediate: true
		}, this.checkAuthRequest);
	},
});

function padNum(num, len) {
	var result = num.toString();

	while (result.length < len) result = '0' + result;

	return result;
}

function dateFromDT(dateTime) {
	return `${padNum(dateTime.getFullYear(), 4)}-${padNum(dateTime.getMonth() + 1, 2)}-${padNum(dateTime.getDate(), 2)}`;
}

function hmFromDT(dateTime) {
	return dateTime.getHours() * 60 + dateTime.getMinutes();
}

function hmToTime(hm) {
	return padNum((hm / 60 | 0) % 24, 2) + padNum(hm % 60, 2);
}

function dTAdd(dateTime, amount, unit) {
	var d = new Date(dateTime.valueOf());

	unit = unit[0].toUpperCase() + unit.substr(1);

	d['set' + unit](d['get' + unit]() + amount);

	return d;
}

function dTMod(dateTime, value, unit) {
	if (value == null) return dateTime;
	var d = new Date(dateTime.valueOf());

	unit = unit[0].toUpperCase() + unit.substr(1);

	d['set' + unit](value);

	return dTMod.apply(this, [d].concat([].slice.call(arguments, 3)));
}

var Event = React.createClass({
	render: function() {
		var p = this.props;
		var li = p.layout_info;
		var span = li.max_end - li.min_start;

		var style = {top: ((hmFromDT(p.start.dateTime) - li.min_start) * 100 / span) + '%', height: ((hmFromDT(p.end.dateTime) - hmFromDT(p.start.dateTime)) * 100 / span) + '%'};

		return <div className="event" style={style}>{this.props.summary || ''}</div>;
	}
});

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const S = {
	HOUR_LINE: {
		COLOR: '#BBB',
		WIDTH: 1,
	}
};

export var Display = React.createClass({
	renderWeekdays: function(events) {
		events = events.filter((event) => {
			return !!(event.start && event.start.dateTime);
		});
		var now = new Date();
		var cur_wday = now.getDay();
		
		var today = dateFromDT(now);

		var shown_days = [];
		var date_map = {};

		for (var diff = -cur_wday; now.getDay() + diff < 7; diff++) {
			var date = dateFromDT(dTAdd(now, diff, 'date'));
			var day = {date, weekday: now.getDay() + diff, events: []};
			shown_days.push(day);
			date_map[date] = day;
		}

		var cur_hour_start = Math.floor(hmFromDT(now) / 60) * 60;
		var min_start = Math.max(0, cur_hour_start - 60);
		var max_end = Math.min(1440, cur_hour_start + 120); 

		for (var event of events) {
			var eventDate = dateFromDT(event.start.dateTime);
			var day = date_map[eventDate];

			if (day == null) continue;

			day.events.push(event);

			min_start = Math.min(min_start, hmFromDT(event.start.dateTime));
			max_end = Math.max(max_end, hmFromDT(event.end.dateTime));
		}

		for (day of shown_days) day.events.sort((a, b) => { return a.start.dateTime.valueOf() - b.start.dateTime.valueOf(); });

		min_start = Math.floor(min_start / 60) * 60;
		max_end = Math.ceil(max_end / 60) * 60;

		return [{min_start, max_end}, shown_days];
	},
	render: function() {
		var [layout_info, weekdays] = this.renderWeekdays(this.props.events);
		var cur_weekday = (new Date()).getDay();
		this.last_layout_info = layout_info;

		return (
			<section id="visual-version">
				<div ref="weekdays" id="weekdays">
					<Display.HourBar layout_info={layout_info} />
					{weekdays.map((day, i) => {
						return <div className={"weekday" + ((i == cur_weekday) ? ' current' : '')}>
							<hgroup>
								<h2>{WEEKDAY_NAMES[day.weekday]}</h2>
								<h3>{day.date}</h3>
							</hgroup>
							{day.events.map((event) => {
								return <Event layout_info={layout_info} {...event} />
							})}
							{(i == cur_weekday) ? <Display.NowLine layout_info={layout_info} /> : ''}
						</div>
					})}
				</div>
			</section>
		);
	},
	renderBg: function() {
		var li = this.last_layout_info;
		var weekdays = this.refs.weekdays;
		if (li == null || weekdays == null) return;

		weekdays = weekdays.getDOMNode();
		var hourbar = weekdays.querySelector('#hourbar');

		var width = weekdays.clientWidth;
		var height = weekdays.clientHeight;

		var renderKey = JSON.stringify(li) + '-' + height + '-' + width;
		if (renderKey == this.renderKey) return;
		this.renderKey = renderKey;

		var buffer = document.createElement('canvas');
		buffer.width = width;
		buffer.height = height;
		var ctx = buffer.getContext('2d');
		ctx.strokeStyle = S.HOUR_LINE.COLOR;
		ctx.strokeWidth = S.HOUR_LINE.WIDTH;
		var offset = (S.HOUR_LINE.WIDTH % 2)/2;
		var left = hourbar.clientWidth;

		var span = li.max_end - li.min_start;

		for (var hm = li.min_start; hm <= li.max_end; hm += 60) {
			var pos = Math.min(Math.round(height * (hm - li.min_start) / span) + offset, height - S.HOUR_LINE.WIDTH / 2);

			ctx.moveTo(left, pos);
			ctx.lineTo(width, pos);
			ctx.stroke();
		}

		weekdays.style.backgroundImage = 'url(' + buffer.toDataURL() + ')';
	},
	componentDidUpdate: function() {
		this.renderBg();
	},
	componentDidMount: function() {
		window.addEventListener("resize", this.renderBg);
	},
	componentWillUnmount: function() {
		window.removeEventListener("resize", this.renderBg);
	},
});

Display.NowLine = React.createClass({
	getInitialState: function() {
		return {hm: hmFromDT(new Date())};
	},
	render: function() {
		var p = this.props;
		var li = p.layout_info;
		var span = li.max_end - li.min_start;

		var pos = (this.state.hm - li.min_start) / span;
		if (pos < 0 || pos >= 1) return null;
		var style = {top: pos * 100 + '%'};

		return <div id="nowline" style={style} />;
	},
	componentDidUpdate: function() {
		if (this.updateInterval != null) clearInterval(this.updateInterval);

		this.updateInterval = setInterval(() => {
			this.setState({hm: hmFromDT(new Date())});
		}, 60000);
	},
	componentWillUnmount: function() {
		if (this.updateInterval != null) clearInterval(this.updateInterval);
	},
});

Display.HourBar = React.createClass({
	render: function() {
		var p = this.props;
		var li = p.layout_info;
		var span = li.max_end - li.min_start;

		var markers = [];

		for (var hm = li.min_start; hm <= li.max_end; hm += 60) {
			markers.push([(hm - li.min_start) / span, hmToTime(hm)]);
		}

		return (
			<ol id="hourbar">
				{markers.map((marker) => {
					var [pos, text] = marker;

					var style = {top: 'calc(' + (pos * 100 + '%') + ' - .5em)'};

					return <li style={style} key={text}>{text}</li>;
				})}
			</ol>
		);
	},
});

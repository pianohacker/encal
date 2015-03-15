function parsePart(event, part) {
	part = part.replace(/^ *"?|"? *$/g, '');
	if (!part || part == ',' || part == ';') return;

	var today = new Date();

	var match;
	if (match = /^(\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(part)) {
		event.start = { dateTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(match[1]), parseInt(match[2])) };
		event.end = { dateTime: new Date(today.getFullYear(), today.getMonth(), today.getDate(), parseInt(match[3]), parseInt(match[4])) };
	} else {
		event.extraParts = event.extraParts || [];
		event.extraParts.push(part);
	}
}

function parseEvent(text) {
	var event = {};
	var semicolon_parts = text.split(/("[^"]+"|;)/);
	var semicolon_detected = false;
	for (var part of semicolon_parts) {
		if (part == ';') semicolon_detected = true;
	}

	if (semicolon_detected) {
		for (var part of semicolon_parts) parsePart(event, part);
	} else {
		for (var part of text.split(/("[^"]+"|,)/)) parsePart(event, part);
	}

	if (event.extraParts) {
		event.title = event.extraParts.join(', ');
	}

	return (event.start ? event : null);
}

export var TextVersion = React.createClass({
	componentDidMount: function() {
		var contents = localStorage['event_text'] || '';
		this.parse(contents);
	},
	getInitialState: function() {
		var contents = localStorage['event_text'] || '';
		return {value: contents};
	},
	startSaveTimeout: function(event_text) {
		if (this.saveTimeout != null) clearTimeout(this.saveTimeout);

		this.saveTimeout = setTimeout(() => {
			localStorage['event_text'] = event_text;
		}, 100);
	},
	parse: function(text, pos) {
		var cur_line = 0;
		var lines = text.split('\n');
		var count = 0;
		var prev_lines = this.prev_lines || {};

		if (pos == null) {
			cur_line = -1;
		} else {
			while (count + lines[cur_line].length + 1 <= pos) {
				count += lines[cur_line].length + 1;
				cur_line++;
			}

			var column = pos - count;
		}

		var events = [];

		var textChanged = false;
		var eventsChanged = false;
		for (var line = 0; line < lines.length; line++) {
			var contents = lines[line];

			var parsed = parseEvent(contents);
			if (parsed) events.push(parsed);

			if (contents == prev_lines[line]) {
				continue;
			} else {
				eventsChanged = true;
			}

			if (line == cur_line) continue;

			if (contents && false) {
				textChanged = true;
				lines[line] = `#${line} ${contents}`;
			}
		}

		if (eventsChanged) {
			this.props.onEventsChanged(events);
		}

		this.prev_lines = lines;

		if (textChanged) {
			var new_value =  lines.join('\n');
			lines[cur_line] = undefined;
			
			return new_value;
		} else {
			return null;
		}
	},
	onChange: function() {
		var textarea = this.refs.textarea.getDOMNode();
		var new_value = this.parse(textarea.value, textarea.selectionStart);

		if (new_value) {
			this.setState({value: new_value}, function() {
				var new_pos = 0;
				// TODO: implement cursor restoration
			});
		} else {
			this.setState({value: textarea.value});
		}

		this.startSaveTimeout(new_value || textarea.value);
	},
	onKeyUp: function() {
		this.onChange();
	},
	render: function() {
		return (
			<section id="text-version">
				<textarea ref="textarea" value={this.state.value} onChange={this.onChange} onKeyUp={this.onKeyUp} />
			</section>
		);
	},
});

function padNum(num, len) {
	var result = num.toString();

	while (result.length < len) result = '0' + result;

	return result;
}

function dateFromDT(dateTime) {
	return `${padNum(dateTime.getFullYear(), 4)}-${padNum(dateTime.getMonth(), 2)}-${padNum(dateTime.getDate(), 2)}`;
}

function hmFromDT(dateTime) {
	return dateTime.getHours() * 60 + dateTime.getMinutes();
}

function hmToTime(hm) {
	return padNum(hm / 60 | 0, 2) + padNum(hm % 60, 2);
}

function dTMod(dateTime, amount, unit) {
	var d = new Date(dateTime.valueOf());

	unit = unit[0].toUpperCase() + unit.substr(1);

	d['set' + unit](d['get' + unit]() + amount);

	return d;
}

var Event = React.createClass({
	render: function() {
		var p = this.props;
		var li = p.layout_info;
		var span = li.max_end - li.min_start;

		var style = {top: ((hmFromDT(p.start.dateTime) - li.min_start) * 100 / span) + '%', height: ((hmFromDT(p.end.dateTime) - hmFromDT(p.start.dateTime)) * 100 / span) + '%'};

		return <div className="event" style={style}>{this.props.title || ''}</div>;
	}
});

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const S = {
	HOUR_LINE: {
		COLOR: '#BBB',
		WIDTH: 1,
	}
};

export var VisualVersion = React.createClass({
	renderWeekdays: function(events) {
		var now = new Date();
		
		var today = dateFromDT(now);

		var weekdays = {};
		weekdays[today] = now.getDay();

		for (var diff = -1; now.getDay() + diff >= 0; diff--) weekdays[dateFromDT(dTMod(now, diff, 'date'))] = now.getDay() + diff;
		for (var diff = 1; now.getDay() + diff <= 6; diff++) weekdays[dateFromDT(dTMod(now, diff, 'date'))] = now.getDay() + diff;

		var weekday_contents = new Array(7);
		for (var i = 0; i < 7; i++) weekday_contents[i] = [];

		var min_start = 1440, max_end = 0; 

		for (var event of events) {
			var eventDate = dateFromDT(event.start.dateTime);
			var weekday = weekdays[eventDate];

			if (weekday == null) continue;

			weekday_contents[weekday].push(event);

			min_start = Math.min(min_start, hmFromDT(event.start.dateTime));
			max_end = Math.max(max_end, hmFromDT(event.end.dateTime));
		}

		for (var i = 0; i < 7; i++) weekday_contents[i].sort((a, b) => { return a.start.dateTime.valueOf() - b.start.dateTime.valueOf(); });

		min_start = Math.floor(min_start / 60) * 60;
		max_end = Math.ceil(max_end / 60) * 60;

		return [{min_start, max_end}, weekday_contents];
	},
	render: function() {
		var [layout_info, weekdays] = this.renderWeekdays(this.props.events);
		var cur_weekday = (new Date()).getDay();
		this.last_layout_info = layout_info;

		return (
			<section id="visual-version">
				<div ref="weekdays" id="weekdays">
					<VisualVersion.HourBar layout_info={layout_info} />
					{weekdays.map((contents, i) => {
						return <div className={"weekday" + ((i == cur_weekday) ? ' current' : '')}>
							<h2>{WEEKDAY_NAMES[i]}</h2>
							{contents.map((event) => {
								return <Event layout_info={layout_info} {...event} />
							})}
							{(i == cur_weekday) ? <VisualVersion.NowLine layout_info={layout_info} /> : ''}
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
			var pos = Math.min(Math.floor(height * (hm - li.min_start) / span) + offset, height - S.HOUR_LINE.WIDTH / 2 - offset);

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

VisualVersion.NowLine = React.createClass({
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

VisualVersion.HourBar = React.createClass({
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

					return <li style={style}>{text}</li>;
				})}
			</ol>
		);
	},
});
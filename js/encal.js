import * as calendar from "calendar";

var App = React.createClass({
	getInitialState: function() {
		return { events: [] };
	},
	onEventsChanged: function(events) {
		this.setState({ events });
	},
	render: function() {
		return (
			<div id="app">
				<calendar.EventsInput onEventsChanged={this.onEventsChanged} />
				<calendar.Display events={this.state.events} />
			</div>
		);
	}
});


React.render(
	<App />,
	document.body
);

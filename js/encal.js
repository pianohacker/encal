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
				<h1>encal</h1>
				<calendar.TextVersion onEventsChanged={this.onEventsChanged} />
				<calendar.VisualVersion events={this.state.events} />
			</div>
		);
	}
});


React.render(
	<App />,
	document.body
);

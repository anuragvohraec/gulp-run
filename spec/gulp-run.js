'use strict';

/* global describe, it */

var Path = require('path');
var Stream = require('stream');
var expect = require('chai').expect;
var gulp = require('gulp');
var run = require('../');


describe('gulp-run', function () {

	var sampleFilename = Path.join(__dirname, 'sample.input.txt');


	it('includes `node_modules/.bin` on the PATH', function (done) {

		run('echo $PATH', {verbosity:0}).exec()
			.pipe(compare(/(^|:)[^:]+node_modules\/\.bin/))
			.pipe(call(done));

	});


	it('lets you set the initial cwd of the command', function (done) {

		run('pwd', {cwd:'/', verbosity:0}).exec()
			.pipe(compare('/\n'))
			.pipe(call(done));

	});


	describe('in a vinyl pipeline', function () {

		it('works with buffers', function (done) {

			gulp.src(sampleFilename, {buffer:true})             // Each line is the line number.
				.pipe(run('awk "NR % 2 == 0"', {verbosity:0})) // Get the even lines with awk.
				.pipe(compare('2\n4\n6\n8\n10\n12\n'))         // Compare the output.
				.pipe(call(done));                             // Profit.

		});


		it('works with streams', function (done) {

			gulp.src(sampleFilename, {buffer:false})            // Each line is the line number.
				.pipe(run('awk "NR % 2 == 0"', {verbosity:0})) // Get the even lines with awk.
				.pipe(compare('2\n4\n6\n8\n10\n12\n'))         // Compare the output.
				.pipe(call(done));                             // Profit.

		});


		it('supports command templates, i.e. `echo <%= file.path %>`', function (done) {

			gulp.src(sampleFilename)
				.pipe(run('echo <%= file.path %>', {verbosity:0})) // echo the name of the file.
				.pipe(compare(sampleFilename + '\n'))
				.pipe(call(done));

		});


		it('emits an `error` event on a failed command', function (done) {

				gulp.src(sampleFilename)
					.pipe(run('exit 1', {verbosity:0})) // Non-zero exit code
					.on('error', function () {
						done();
					});

		});

	});


	describe('direct execution (`.exec`)', function () {

		it('is asynchronous (this test sleeps for 1s)', function (done) {

			var startTime = process.hrtime()[0]; // Current time in seconds

			// Sleep for 1s, then callback
			run('sleep 1', {verbosity:0}).exec(function () {
				var delta = process.hrtime()[0] - startTime; // Time in seconds
				expect(delta).to.equal(1);
				done();
			});

		});


		it('returns a vinyl stream wrapping stdout', function (done) {

			run('echo Hello World', {verbosity:0}).exec() // Start a command with `.exec()`.
				.pipe(compare('Hello World\n'))          // stdout piped as a Vinyl file.
				.pipe(call(done));

		});


		it('emits an `error` event on a failed command', function (done) {

			run('exit 1', {verbosity:0}).exec() // Non-zero exit code
				.on('error', function () {
					done();
				});

		});

	});
});



/// Helpers
/// --------------------------------------------------

// A stream that calls a function whenever a file is piped in.
function call(callback1) {
	var stream = new Stream.Transform({objectMode:true});
	stream._transform = function (file, enc, callback2) {
		this.push(file);
		process.nextTick(callback2);
		process.nextTick(callback1);
	};
	return stream;
}


// A stream that throws if the contents of the incoming file doesn't match the argument.
function compare(match) {
	if (!(match instanceof RegExp)) {
		match = new RegExp('^' + match.toString() + '$');
	}
	var stream = new Stream.Transform({objectMode:true});
	stream._transform = function (file, end, callback) {
		var contents;

		if (file.isStream()) {
			var newFile = file.clone();
			newFile.contents = new Stream.Transform();
			newFile.contents._transform = function (chunk, enc, callback) {
				newFile.contents.push(chunk);
				return callback();
			};
			contents = '';
			file.contents.on('readable', function () {
				var chunk;
				(function loop() {
					chunk = file.contents.read();
					if (chunk) {
						contents += chunk;
						loop();
					}
				})();
			});
			file.contents.on('end', function () {
				expect(contents).to.match(match);
				newFile.contents.push(contents);
				newFile.contents.end();
				stream.push(newFile);
				process.nextTick(callback);
			});
			return;
		}

		contents = (file.isBuffer()) ? file.contents.toString() : file.contents;
		expect(contents).to.match(match);
		stream.push(file);
		process.nextTick(callback);
		return;
	};
	return stream;
}


// A vinyl stream that tees the contents of the incoming file to the given text stream.
// Useful for debugging, like `stream.pipe(tee(process.stdout))` to print the stream.
function tee(out) {
	var stream = new Stream.Transform({objectMode:true});
	stream._transform = function (file, enc, callback) {
		var push = this.push.bind(this);

		if (file.isStream()) {
			var newFile = file.clone();
			newFile.contents = new Stream.Transform();
			newFile.contents._transform = function (chunk, enc, callback) {
				this.push(chunk);
				return callback();
			};
			file.contents.on('readable', function () {
				var chunk;
				(function loop() {
					chunk = file.contents.read();
					if (chunk) {
						out.write(chunk);
						newFile.contents.write(chunk);
						loop();
					}
				})();
			});
			file.contents.on('end', function () {
				newFile.contents.end();
				push(newFile);
				process.nextTick(callback);
			});
			return;
		}

		if (file.isBuffer()) {
			out.write(file.contents);
			push(file);
			process.nextTick(callback);
			return;
		}

		// Else - file.isNull()
		push(file);
		return;
	};
	return stream;
}

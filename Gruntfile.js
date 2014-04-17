/* jshint node: true */

module.exports = function(grunt) {
    require('load-grunt-tasks')(grunt);

    grunt.initConfig({
        pkg: grunt.file.readJSON('package.json'),
        jshint: {
            options: {
                jshintrc: ".jshintrc"
            },
            all: [ 'src/**/*.js' ]
        },
        browserify: {
            source: {
                options: {
                    bundleOptions: {
                        standalone: "<%= pkg.name %>"
                    }
                },
                files: [{
                    src: [ 'src/api.js' ],
                    dest: 'dist/<%= pkg.name %>.js'
                }]
            }
        },
        uglify: {
            options: {
                mangle: true,
                compress: {
                    unused: false
                },
                beautify: false,
                sourceMap: true
            },
            source: {
                files: [{
                    src: [ 'dist/<%= pkg.name %>.js' ],
                    dest: 'dist/<%= pkg.name %>.min.js'
                }]
            }
        },
        clean: {
            javascript: {
                src: [ 'dist/<%= pkg.name %>.js', 'dist/<%= pkg.name %>.min.(js|map)' ]
            }
        }
    });

    grunt.registerTask('build', [ 'jshint:all', 'browserify:source', 'uglify:source' ]);
    grunt.registerTask('default', ['build']);
};

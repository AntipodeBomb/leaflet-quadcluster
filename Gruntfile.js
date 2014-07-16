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
        concat: {
            source: {
                files: [{
                    dest: 'dist/leaflet.quadcluster.js',
                    src: [
                        'src/api.js',
                        'src/tree/tree.js', 'src/tree/aggregate.js',
                        'src/MarkerCluster.js', 'src/MarkerClusterGroup.js'
                    ]
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
                    src: [ 'dist/leaflet.quadcluster.js' ],
                    dest: 'dist/leaflet.quadcluster.min.js'
                }]
            }
        },
        clean: {
            javascript: {
                src: [ 'dist/leaflet.quadcluster.js', 'dist/leaflet.quadcluster.min.(js|map)' ]
            }
        }
    });

    grunt.registerTask('build', [ 'jshint:all', 'concat:source', 'uglify:source' ]);
    grunt.registerTask('default', ['build']);
};

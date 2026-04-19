(function($) {
    'use strict';
    
    $(document).on('elementor:init', function() {
        // Add button to Elementor panel
        elementor.hooks.addAction('panel/open_editor/widget', function(panel, model, view) {
            var $cloneBtn = $('<button>', {
                'class': 'elementor-button elementor-button-success',
                'text': 'Clone from URL',
                'style': 'margin: 10px 0; width: 100%;',
                'click': function() {
                    showCloneDialog();
                }
            });
            
            panel.$el.find('.elementor-panel-navigation').after($cloneBtn);
        });
        
        function showCloneDialog() {
            var url = prompt('Enter website URL to clone:');
            if (!url) return;
            
            $.ajax({
                url: oec_ajax.ajax_url,
                type: 'POST',
                data: {
                    action: 'oec_clone_section',
                    url: url
                },
                beforeSend: function() {
                    elementor.notifications.showToast({
                        message: 'Cloning section...'
                    });
                },
                success: function(response) {
                    if (response.success) {
                        // Import the JSON into current element
                        var elementorData = response.data.elementor_data;
                        importToElementor(elementorData);
                    } else {
                        elementor.notifications.showToast({
                            message: 'Clone failed: ' + response.data.message,
                            type: 'error'
                        });
                    }
                },
                error: function() {
                    elementor.notifications.showToast({
                        message: 'Connection failed. Is the backend running?',
                        type: 'error'
                    });
                }
            });
        }
        
        function importToElementor(data) {
            // Add sections to the page
            if (data.content && data.content.length > 0) {
                data.content.forEach(function(section) {
                    var sectionModel = elementor.getPreviewContainer().addElementModel({
                        elType: 'section',
                        settings: section.settings,
                        elements: section.elements
                    });
                    
                    elementor.getPreviewContainer().addChildModel(sectionModel);
                });
                
                elementor.notifications.showToast({
                    message: 'Section imported successfully!'
                });
                
                // Save the page
                $e.run('document/save/default');
            }
        }
    });
})(jQuery);

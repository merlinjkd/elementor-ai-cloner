<?php
/**
 * Plugin Name: OpenClaw Elementor Cloner
 * Description: AI-powered Elementor section cloning from any website
 * Version: 1.0.0
 * Author: OpenClaw
 * Requires Elementor: 3.0.0
 */

if (!defined('ABSPATH')) exit;

class OpenClaw_Elementor_Cloner {
    private $backend_url;
    
    public function __construct() {
        $this->backend_url = get_option('oec_backend_url', 'http://localhost:3000');
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('wp_ajax_oec_clone_section', [$this, 'ajax_clone_section']);
        add_action('elementor/editor/after_enqueue_scripts', [$this, 'enqueue_editor_assets']);
    }
    
    public function add_admin_menu() {
        add_submenu_page(
            'elementor',
            'Section Cloner',
            'Section Cloner',
            'manage_options',
            'oec-cloner',
            [$this, 'render_admin_page']
        );
    }
    
    public function register_settings() {
        register_setting('oec_settings', 'oec_backend_url');
    }
    
    public function render_admin_page() {
        ?>
        <div class="wrap">
            <h1>OpenClaw Elementor Cloner</h1>
            <form method="post" action="options.php">
                <?php settings_fields('oec_settings'); ?>
                <table class="form-table">
                    <tr>
                        <th>Backend URL</th>
                        <td>
                            <input type="text" name="oec_backend_url" 
                                   value="<?php echo esc_attr($this->backend_url); ?>" 
                                   class="regular-text">
                            <p class="description">Your Mac backend (e.g., http://localhost:3000 or http://192.168.1.50:3000)</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>
            
            <hr>
            <h2>Clone Section</h2>
            <table class="form-table">
                <tr>
                    <th>Website URL</th>
                    <td>
                        <input type="url" id="clone-url" class="regular-text" 
                               placeholder="https://example.com">
                        <button id="clone-btn" class="button button-primary">Clone Section</button>
                    </td>
                </tr>
            </table>
            
            <div id="clone-result" style="margin-top: 20px;"></div>
            <textarea id="elementor-json" style="width: 100%; height: 300px; display: none;"></textarea>
            <button id="import-btn" class="button" style="display: none;">Copy JSON for Import</button>
            
            <script>
            jQuery(document).ready(function($) {
                $('#clone-btn').click(function() {
                    var url = $('#clone-url').val();
                    if (!url) {
                        alert('Please enter a URL');
                        return;
                    }
                    
                    $('#clone-result').html('<p>Cloning... please wait.</p>');
                    
                    $.ajax({
                        url: ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'oec_clone_section',
                            url: url
                        },
                        success: function(response) {
                            if (response.success) {
                                var elementorData = response.data.elementor_data;
                                $('#elementor-json').val(JSON.stringify(elementorData, null, 2)).show();
                                $('#import-btn').show();
                                $('#clone-result').html('<p style="color: green;">✓ Section cloned successfully!</p>');
                            } else {
                                $('#clone-result').html('<p style="color: red;">✗ Error: ' + response.data.message + '</p>');
                            }
                        },
                        error: function() {
                            $('#clone-result').html('<p style="color: red;">✗ Request failed. Is the backend running?</p>');
                        }
                    });
                });
                
                $('#import-btn').click(function() {
                    var json = $('#elementor-json').val();
                    navigator.clipboard.writeText(json);
                    $(this).text('Copied!');
                    setTimeout(() => $(this).text('Copy JSON for Import'), 2000);
                });
            });
            </script>
        </div>
        <?php
    }
    
    public function ajax_clone_section() {
        $url = sanitize_url($_POST['url']);
        
        $response = wp_remote_post($this->backend_url . '/clone-section', [
            'body' => json_encode(['url' => $url]),
            'headers' => ['Content-Type' => 'application/json'],
            'timeout' => 120
        ]);
        
        if (is_wp_error($response)) {
            wp_send_json_error(['message' => $response->get_error_message()]);
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        if (!isset($body['elementor_json'])) {
            wp_send_json_error(['message' => 'Invalid response from backend']);
        }
        
        // Convert to Elementor format
        $elementor_data = $this->convert_to_elementor_format($body['elementor_json']);
        
        wp_send_json_success(['elementor_data' => $elementor_data]);
    }
    
    private function convert_to_elementor_format($data) {
        // Transform our JSON to Elementor's expected format
        $content = [];
        
        foreach ($data['elements'] as $section) {
            $section_data = [
                'id' => $section['id'],
                'elType' => 'section',
                'settings' => $this->clean_settings($section['settings']),
                'elements' => []
            ];
            
            if (isset($section['elements'])) {
                foreach ($section['elements'] as $widget) {
                    $section_data['elements'][] = [
                        'id' => $widget['id'],
                        'elType' => 'widget',
                        'widgetType' => $widget['widgetType'],
                        'settings' => $this->clean_settings($widget['settings'])
                    ];
                }
            }
            
            $content[] = $section_data;
        }
        
        return [
            'version' => '0.4',
            'title' => $data['title'] ?? 'Cloned Section',
            'type' => 'page',
            'content' => $content,
            'page_settings' => $this->clean_settings($data['page_settings'] ?? [])
        ];
    }
    
    private function clean_settings($settings) {
        // Remove empty/null values that might break Elementor
        return array_filter($settings, function($value) {
            return $value !== null && $value !== '';
        });
    }
    
    public function enqueue_editor_assets() {
        wp_enqueue_script(
            'oec-elementor',
            plugins_url('assets/elementor.js', __FILE__),
            ['jquery', 'elementor-editor'],
            '1.0.0',
            true
        );
    }
}

new OpenClaw_Elementor_Cloner();
